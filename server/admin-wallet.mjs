import { z } from "zod";
import { rateLimit } from "express-rate-limit";
import {
  audit,
  bankTransferKey,
  hash,
  id,
  now,
  passwordMatches,
  transaction,
  wallet,
} from "./db.mjs";
import { fail, money } from "./commerce.mjs";

const reference = z
  .string()
  .normalize("NFKC")
  .trim()
  .min(3)
  .max(100)
  .regex(
    /^[A-Za-z0-9._\/-]+$/,
    "ใช้เลขอ้างอิง ตัวอักษรอังกฤษ ตัวเลข จุด ขีดกลาง ขีดล่าง หรือ /",
  );
const inputSchema = z
  .object({
    userId: z.string().regex(/^[a-f0-9]{32}$/),
    amount: money.refine((v) => v > 0, "ยอดเติมต้องมากกว่า 0"),
    expectedBalance: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    source: z.enum(["bank_transfer", "cash", "adjustment"]),
    reference,
    senderBankCode: z
      .string()
      .regex(/^\d{3}$/)
      .optional(),
    reason: z
      .string()
      .trim()
      .min(5, "กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร")
      .max(500),
    actorPassword: z.string().min(1).max(128),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.source === "bank_transfer" && !v.senderBankCode)
      ctx.addIssue({
        code: "custom",
        path: ["senderBankCode"],
        message: "ระบุรหัสธนาคารผู้โอน 3 หลักให้ตรงกับสลิป",
      });
    if (v.source !== "bank_transfer" && v.senderBankCode)
      ctx.addIssue({
        code: "custom",
        path: ["senderBankCode"],
        message: "ใช้รหัสธนาคารเฉพาะรายการโอน",
      });
  });
const kinds = [
  "topup",
  "admin_topup",
  "purchase",
  "settlement",
  "refund",
  "commission",
  "consignment",
];
export function attachAdminWallet(
  app,
  db,
  { permission, asyncRoute, pageRows },
) {
  const limiter = rateLimit({
    windowMs: 15 * 60000,
    limit: 10,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => req.user.id,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "ยืนยันรายการผิดหลายครั้ง กรุณารอ 15 นาที" },
  });
  app.get(
    "/api/admin/wallet/transactions",
    permission("finance"),
    asyncRoute((req, res) => {
      const kind = z.enum(["", ...kinds]).parse(req.query.kind || "");
      const query = String(req.query.q || "").slice(0, 100),
        pattern = "%" + query + "%";
      res.json(
        pageRows(
          db,
          `SELECT l.*,l.balance_after-l.amount balance_before,u.name customer_name,u.email customer_email,m.actor_id,a.name actor_name,m.source,m.reference document_reference,m.reason,t.bank_ref slip_bank_reference FROM ledger l JOIN users u ON u.id=l.user_id LEFT JOIN manual_topups m ON l.kind='admin_topup' AND l.reference=m.id LEFT JOIN users a ON a.id=m.actor_id LEFT JOIN topups t ON l.kind='topup' AND l.reference=t.id WHERE (?='' OR l.kind=?) AND (u.name LIKE ? OR u.email LIKE ? OR l.id LIKE ? OR l.reference LIKE ? OR COALESCE(m.reference,'') LIKE ? OR COALESCE(a.name,'') LIKE ?) ORDER BY l.created_at DESC,l.rowid DESC`,
          [kind, kind, ...Array(6).fill(pattern)],
          req,
        ),
      );
    }),
  );
  app.get(
    "/api/admin/wallet/customers",
    permission("wallet_topup"),
    asyncRoute((req, res) => {
      const q = String(req.query.q || "")
        .trim()
        .slice(0, 100);
      if (q.length < 2) return res.json({ items: [] });
      res.json({
        items: db
          .prepare(
            "SELECT id,name,email,balance FROM users WHERE role_id='customer' AND active=1 AND (name LIKE ? OR email LIKE ? OR id=?) ORDER BY name,id LIMIT 15",
          )
          .all("%" + q + "%", "%" + q + "%", q),
      });
    }),
  );
  app.post(
    "/api/admin/wallet/topups",
    permission("wallet_topup"),
    limiter,
    asyncRoute((req, res) => {
      const v = inputSchema.parse(req.body);
      const key = z
        .string()
        .regex(/^[A-Za-z0-9_-]{16,80}$/, "รหัสคำขอไม่ถูกต้อง")
        .parse(req.get("Idempotency-Key"));
      if (
        !req.user.has_password ||
        !passwordMatches(v.actorPassword, req.user.password)
      ) {
        audit(
          db,
          req.user.id,
          "wallet.admin_reauthentication_failed",
          "manual_topup",
        );
        fail(400, "รหัสผ่านผู้ดำเนินการไม่ถูกต้อง");
      }
      const { actorPassword, ...details } = v,
        digest = hash(JSON.stringify(details));
      const result = transaction(db, () => {
        const old = db
          .prepare(
            "SELECT * FROM manual_topups WHERE actor_id=? AND request_key=?",
          )
          .get(req.user.id, key);
        if (old) {
          if (old.request_hash !== digest)
            fail(409, "รหัสคำขอนี้ถูกใช้กับข้อมูลอื่นแล้ว");
          return {
            id: old.id,
            amount: old.amount,
            balanceBefore: old.balance_before,
            balanceAfter: old.balance_after,
            replayed: true,
          };
        }
        const target = db
          .prepare("SELECT * FROM users WHERE id=?")
          .get(v.userId);
        if (!target) fail(404, "ไม่พบลูกค้า");
        if (target.role_id !== "customer" || !target.active)
          fail(409, "เติมเงินได้เฉพาะบัญชีลูกค้าที่ใช้งานอยู่");
        if (target.balance !== v.expectedBalance)
          fail(409, "ยอดลูกค้าเปลี่ยนแล้ว กรุณาค้นหาและตรวจสอบยอดอีกครั้ง");
        if (!Number.isSafeInteger(target.balance + v.amount))
          fail(409, "ยอดรวมเกินขอบเขตที่ระบบรองรับ");
        const receiptKey = bankTransferKey(v.reference);
        if (
          db
            .prepare("SELECT id FROM manual_topups WHERE reference_key=?")
            .get(receiptKey)
        )
          fail(409, "เลขอ้างอิงนี้ถูกเติมเงินจากหลังบ้านแล้ว");
        const bankRef =
          v.source === "bank_transfer"
            ? bankTransferKey(v.senderBankCode + ":" + v.reference)
            : null;
        if (
          bankRef &&
          db
            .prepare("SELECT reference FROM funding_receipts WHERE bank_ref=?")
            .get(bankRef)
        )
          fail(409, "รายการโอนนี้ถูกเติมเงินแล้วจากสลิปหรือหลังบ้าน");
        const tid = id(),
          createdAt = now();
        if (bankRef)
          db.prepare("INSERT INTO funding_receipts VALUES(?,?,?,?)").run(
            bankRef,
            "manual",
            tid,
            createdAt,
          );
        const balance = wallet(db, target.id, v.amount, "admin_topup", tid);
        db.prepare(
          "INSERT INTO manual_topups VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        ).run(
          tid,
          req.user.id,
          target.id,
          key,
          digest,
          v.source,
          v.reference,
          receiptKey,
          bankRef,
          v.reason,
          v.amount,
          target.balance,
          balance,
          createdAt,
        );
        audit(db, req.user.id, "wallet.admin_topup", tid, {
          userId: target.id,
          amount: v.amount,
          source: v.source,
          reference: v.reference,
        });
        return {
          id: tid,
          amount: v.amount,
          balanceBefore: target.balance,
          balanceAfter: balance,
          replayed: false,
        };
      });
      res.status(result.replayed ? 200 : 201).json(result);
    }),
  );
}
