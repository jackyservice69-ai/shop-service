import { z } from "zod";
import { rateLimit } from "express-rate-limit";
import banks from "../shared/bank-logos.json" with { type: "json" };
import {
  id,
  now,
  hash,
  transaction,
  audit,
  wallet,
  bankTransferKey,
} from "./db.mjs";
import { fail, money } from "./commerce.mjs";
import { consignmentFunds } from "./withdrawal-funds.mjs";
import { notifyWithdrawal } from "./notifications.mjs";

const requestSchema = z
  .object({
    amount: money.refine((v) => v >= 100, "ถอนขั้นต่ำ 1 บาท"),
    bankCode: z
      .string()
      .refine((v) => Object.hasOwn(banks, v), "กรุณาเลือกธนาคาร"),
    bankNumber: z
      .string()
      .trim()
      .regex(/^\d{6,20}$/, "ระบุเลขบัญชีเป็นตัวเลข 6–20 หลัก"),
    accountName: z.string().trim().min(2).max(120),
  })
  .strict();
const decisionSchema = z
  .object({
    version: z.number().int().positive(),
    action: z.enum(["approve", "reject", "claim", "release", "pay"]),
    note: z.string().trim().max(500).default(""),
    transferReference: z.string().trim().max(100).default(""),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (["reject", "release"].includes(v.action) && v.note.length < 5)
      ctx.addIssue({
        code: "custom",
        path: ["note"],
        message: "ระบุเหตุผลอย่างน้อย 5 ตัวอักษร",
      });
    if (
      v.action === "pay" &&
      !/^[A-Za-z0-9._/-]{3,100}$/.test(v.transferReference)
    )
      ctx.addIssue({
        code: "custom",
        path: ["transferReference"],
        message: "ระบุเลขอ้างอิงการโอน 3–100 ตัวอักษร ใช้ตัวเลข/อังกฤษ . _ / -",
      });
  });
const safeId = z.string().regex(/^[a-f0-9]{32}$/);
function sellerReady(db, userId) {
  const row = db
    .prepare(
      "SELECT c.status,u.active FROM consignors c JOIN users u ON u.id=c.user_id WHERE c.user_id=?",
    )
    .get(userId);
  if (row?.status !== "approved" || !row.active)
    fail(403, "ต้องเป็นตัวแทนที่ได้รับอนุมัติและเปิดใช้งานก่อน");
}
const rowSql = `SELECT w.id,w.user_id,w.amount,w.bank_code,w.bank_number,w.account_name,w.status,w.version,w.created_at,
 w.approved_by,w.approved_at,w.processing_by,w.processing_at,w.decided_by,w.decided_at,w.decision_note,w.paid_by,w.paid_at,w.transfer_reference,
 c.shop_name,u.name customer_name,a.name approved_by_name,p.name paid_by_name,h.name processing_by_name
 FROM withdrawals w JOIN users u ON u.id=w.user_id JOIN consignors c ON c.user_id=w.user_id
 LEFT JOIN users a ON a.id=w.approved_by LEFT JOIN users p ON p.id=w.paid_by LEFT JOIN users h ON h.id=w.processing_by`;
function list(db, req, pageRows, mine) {
  const q = z
    .object({
      status: z
        .enum([
          "",
          "pending",
          "approved",
          "processing",
          "paid",
          "rejected",
          "cancelled",
        ])
        .default(""),
      page: z.coerce.number().int().min(1).max(100000).optional(),
      size: z.coerce.number().int().min(1).max(100).optional(),
    })
    .strict()
    .parse(req.query);
  return pageRows(
    db,
    rowSql +
      ` WHERE (?='' OR w.status=?)${mine ? " AND w.user_id=?" : ""} ORDER BY w.created_at DESC,w.rowid DESC`,
    [q.status, q.status, ...(mine ? [req.user.id] : [])],
    req,
  );
}
export function attachWithdrawals(
  app,
  db,
  { auth, csrf, permission, asyncRoute, pageRows },
) {
  const limiter = rateLimit({
    windowMs: 15 * 60000,
    limit: 20,
    keyGenerator: (req) => req.user.id,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "ส่งคำขอหลายครั้ง กรุณารอแล้วลองใหม่" },
  });
  app.get(
    "/api/consignment/withdrawals",
    auth,
    asyncRoute((req, res) => {
      const member = db
        .prepare("SELECT status FROM consignors WHERE user_id=?")
        .get(req.user.id);
      if (!member) fail(403, "ยังไม่ได้เป็นตัวแทนฝากขาย");
      res.json({
        ...list(db, req, pageRows, true),
        available: consignmentFunds(db, req.user.id),
        held: db
          .prepare(
            "SELECT COALESCE(SUM(amount),0) n FROM withdrawals WHERE user_id=? AND status IN ('pending','approved','processing')",
          )
          .get(req.user.id).n,
        canRequest: member.status === "approved",
      });
    }),
  );
  app.post(
    "/api/consignment/withdrawals",
    auth,
    csrf,
    limiter,
    asyncRoute((req, res) => {
      const v = requestSchema.parse(req.body),
        key = z
          .string()
          .regex(/^[A-Za-z0-9_-]{16,80}$/)
          .parse(req.get("Idempotency-Key")),
        digest = hash(JSON.stringify(v));
      const result = transaction(db, () => {
        const old = db
          .prepare(
            "SELECT * FROM withdrawals WHERE user_id=? AND request_key=?",
          )
          .get(req.user.id, key);
        if (old) {
          if (old.request_hash !== digest)
            fail(409, "รหัสคำขอนี้ใช้กับข้อมูลอื่นแล้ว");
          return { ...old, replayed: true };
        }
        sellerReady(db, req.user.id);
        if (v.amount > consignmentFunds(db, req.user.id))
          fail(409, "ยอดรายได้ฝากขายที่ถอนได้ไม่เพียงพอ กรุณาโหลดข้อมูลใหม่");
        const wid = id();
        db.prepare(
          "INSERT INTO withdrawals(id,user_id,amount,bank_code,bank_number,account_name,request_key,request_hash,status,created_at) VALUES(?,?,?,?,?,?,?,?,'pending',?)",
        ).run(
          wid,
          req.user.id,
          v.amount,
          v.bankCode,
          v.bankNumber,
          v.accountName,
          key,
          digest,
          now(),
        );
        wallet(db, req.user.id, -v.amount, "withdrawal_hold", wid);
        audit(db, req.user.id, "withdrawal.requested", wid, {
          amount: v.amount,
          bankCode: v.bankCode,
          accountLast4: v.bankNumber.slice(-4),
        });
        const row = db.prepare("SELECT * FROM withdrawals WHERE id=?").get(wid);
        notifyWithdrawal(db, row, "submitted");
        return row;
      });
      res
        .status(result.replayed ? 200 : 201)
        .json({
          ...db.prepare(rowSql + " WHERE w.id=?").get(result.id),
          replayed: !!result.replayed,
        });
    }),
  );
  app.post(
    "/api/consignment/withdrawals/:id/cancel",
    auth,
    csrf,
    asyncRoute((req, res) => {
      const wid = safeId.parse(req.params.id),
        v = z
          .object({ version: z.number().int().positive() })
          .strict()
          .parse(req.body);
      transaction(db, () => {
        const w = db
          .prepare("SELECT * FROM withdrawals WHERE id=? AND user_id=?")
          .get(wid, req.user.id);
        if (!w) fail(404, "ไม่พบคำขอถอน");
        if (w.status !== "pending" || w.version !== v.version)
          fail(409, "คำขอเปลี่ยนแปลงแล้ว กรุณาโหลดใหม่");
        db.prepare(
          "UPDATE withdrawals SET status='cancelled',version=version+1,decided_by=?,decided_at=? WHERE id=?",
        ).run(req.user.id, now(), wid);
        wallet(db, w.user_id, w.amount, "withdrawal_release", wid);
        audit(db, req.user.id, "withdrawal.cancelled", wid, {
          amount: w.amount,
        });
        notifyWithdrawal(db, { ...w, version: w.version + 1 }, "cancelled");
      });
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/admin/withdrawals",
    permission("withdrawals"),
    asyncRoute((req, res) => res.json(list(db, req, pageRows, false))),
  );
  app.post(
    "/api/admin/withdrawals/:id/:action",
    (req, res, next) =>
      permission(
        ["claim", "release", "pay"].includes(req.params.action)
          ? "withdrawals_pay"
          : "withdrawals_approve",
      )(req, res, next),
    csrf,
    asyncRoute((req, res) => {
      const wid = safeId.parse(req.params.id),
        v = decisionSchema.parse({ ...req.body, action: req.params.action });
      transaction(db, () => {
        const w = db.prepare("SELECT * FROM withdrawals WHERE id=?").get(wid);
        if (!w) fail(404, "ไม่พบคำขอถอน");
        if (w.user_id === req.user.id)
          fail(403, "ไม่สามารถอนุมัติหรือดำเนินการคำขอถอนของตนเอง");
        if (w.version !== v.version)
          fail(409, "คำขอเปลี่ยนแปลงแล้ว กรุณาโหลดใหม่");
        if (v.action === "approve") {
          if (w.status !== "pending")
            fail(409, "อนุมัติได้เฉพาะคำขอที่รออนุมัติ");
          sellerReady(db, w.user_id);
          db.prepare(
            "UPDATE withdrawals SET status='approved',approved_by=?,approved_at=?,version=version+1 WHERE id=?",
          ).run(req.user.id, now(), wid);
        } else if (v.action === "reject") {
          if (!["pending", "approved"].includes(w.status))
            fail(409, "คำขอนี้สิ้นสุดแล้ว");
          db.prepare(
            "UPDATE withdrawals SET status='rejected',decision_note=?,decided_by=?,decided_at=?,version=version+1 WHERE id=?",
          ).run(v.note, req.user.id, now(), wid);
          wallet(db, w.user_id, w.amount, "withdrawal_release", wid);
        } else if (v.action === "claim") {
          if (w.status !== "approved")
            fail(409, "รายการนี้ยังไม่พร้อม หรือมีผู้รับดำเนินการแล้ว");
          sellerReady(db, w.user_id);
          db.prepare(
            "UPDATE withdrawals SET status='processing',processing_by=?,processing_at=?,version=version+1 WHERE id=?",
          ).run(req.user.id, now(), wid);
        } else if (v.action === "release") {
          if (
            w.status !== "processing" ||
            (w.processing_by !== req.user.id && req.user.role_id !== "admin")
          )
            fail(403, "เฉพาะผู้รับดำเนินการหรือเจ้าของร้านที่คืนคิวโอนได้");
          db.prepare(
            "UPDATE withdrawals SET status='approved',processing_by=NULL,processing_at=NULL,version=version+1 WHERE id=?",
          ).run(wid);
        } else {
          if (w.status !== "processing" || !w.approved_by)
            fail(409, "ต้องได้รับอนุมัติและรับดำเนินการโอนก่อน");
          if (w.processing_by !== req.user.id)
            fail(403, "เฉพาะผู้รับดำเนินการโอนที่บันทึกผลได้");
          sellerReady(db, w.user_id);
          const ref = bankTransferKey(v.transferReference);
          if (
            db
              .prepare("SELECT id FROM withdrawals WHERE transfer_reference=?")
              .get(ref)
          )
            fail(409, "เลขอ้างอิงการโอนนี้ใช้แล้ว");
          db.prepare(
            "UPDATE withdrawals SET status='paid',paid_by=?,paid_at=?,transfer_reference=?,version=version+1 WHERE id=?",
          ).run(req.user.id, now(), ref, wid);
        }
        audit(db, req.user.id, "withdrawal." + v.action, wid, {
          amount: w.amount,
          fromStatus: w.status,
          processingBy: w.processing_by || null,
          note: v.note,
          transferReference:
            v.action === "pay"
              ? bankTransferKey(v.transferReference)
              : undefined,
        });
        const action = {
          approve: "approved",
          reject: "rejected",
          claim: "processing",
          release: "approved",
          pay: "paid",
        }[v.action];
        notifyWithdrawal(db, { ...w, version: w.version + 1 }, action);
      });
      res.json(db.prepare(rowSql + " WHERE w.id=?").get(wid));
    }),
  );
}
