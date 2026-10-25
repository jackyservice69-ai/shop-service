import { z } from "zod";
import {
  id,
  getSettings,
  setSetting,
  audit,
  transaction,
  hash,
  now,
} from "./db.mjs";
import { easyRequest, secret } from "./integrations.mjs";
import { fail } from "./commerce.mjs";
import {
  merchantAccounts,
  accountReceiver,
} from "./merchant-account-policy.mjs";
import { receivingAccountKey, currentPaymentQr } from "./receiving-policy.mjs";
import { verifyPaymentQr } from "./payment-qr.mjs";

export async function branchAccounts(db, config) {
  const items = [];
  for (let page = 1; page <= 100; page++) {
    const data = await easyRequest(
      db,
      config,
      `bank-accounts?limit=100&page=${page}`,
    );
    if (!Array.isArray(data?.items) || !Number.isInteger(data.total))
      fail(502, "ข้อมูลบัญชี EasySlip ไม่สมบูรณ์");
    items.push(...data.items);
    if (items.length >= data.total) return items;
    if (!data.items.length) break;
  }
  fail(502, "อ่านบัญชี EasySlip ไม่ครบ กรุณาลองใหม่");
}
const name = (v) =>
  String(v || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
const digits = (v) => String(v || "").replace(/[-\s]/g, "");
const editSchema = z
  .object({
    label: z.string().trim().min(1).max(100),
    visible: z.boolean(),
    isPrimary: z.boolean(),
    version: z.number().int().positive(),
  })
  .strict();
const accountDto = (s, a, key) => ({
  ...a,
  bankVerification: undefined,
  qrs: a.qrs.map((q) => ({
    ...q,
    verification: undefined,
    receiver: undefined,
    ready: !!currentPaymentQr(accountReceiver(s, a, q), key),
  })),
});
const requireAccount = (s, aid) => {
  const a = merchantAccounts(s).find((a) => a.id === aid);
  if (!a) fail(404, "ไม่พบบัญชีร้านค้า");
  return a;
};
function commitAccounts(db, actor, action, aid, change) {
  return transaction(db, () => {
    const settings = getSettings(db),
      accounts = merchantAccounts(settings);
    const summary = (a) =>
      a
        ? {
            id: a.id,
            label: a.label,
            visible: a.visible,
            isPrimary: a.isPrimary,
            version: a.version,
            qrs: a.qrs.map((q) => ({
              id: q.id,
              label: q.label,
              visible: q.visible,
              isPrimary: q.isPrimary,
            })),
          }
        : null;
    const before = summary(accounts.find((a) => a.id === aid));
    const result = change(accounts, settings);
    if (accounts.length > 20) fail(409, "เพิ่มได้สูงสุด 20 บัญชี");
    setSetting(db, "merchantAccounts", accounts);
    audit(db, actor, action, aid, {
      before,
      after: summary(accounts.find((a) => a.id === aid)),
      primaryAccountId: accounts.find((a) => a.isPrimary)?.id || null,
    });
    return result;
  });
}
function primaryAccount(accounts, selected) {
  if (!selected.isPrimary) return;
  for (const a of accounts)
    if (a.id !== selected.id && a.isPrimary) {
      a.isPrimary = false;
      a.version++;
    }
}
export function attachMerchantAccounts(
  app,
  db,
  config,
  { auth, csrf, permission, asyncRoute },
) {
  const owner = [auth, permission("settings")];
  app.get(
    "/api/admin/merchant-accounts",
    ...owner,
    asyncRoute((req, res) => {
      const s = getSettings(db),
        key = hash(secret(db, "easyslipApiKey", config));
      res.json({
        items: merchantAccounts(s).map((a) => accountDto(s, a, key)),
      });
    }),
  );
  app.get(
    "/api/admin/merchant-accounts/branch",
    ...owner,
    asyncRoute(async (req, res) => {
      const key = hash(secret(db, "easyslipApiKey", config));
      const [accounts, banks] = await Promise.all([
        branchAccounts(db, config),
        easyRequest(db, config, "banks"),
      ]);
      if (!Array.isArray(banks)) fail(502, "ข้อมูลธนาคาร EasySlip ไม่สมบูรณ์");
      if (key !== hash(secret(db, "easyslipApiKey", config)))
        fail(409, "API key เปลี่ยน กรุณาโหลดบัญชีใหม่");
      res.json({
        items: accounts
          .filter((a) => /^\d{3}$/.test(a.bankCode))
          .map((a) => ({
            id: a.id,
            bankCode: a.bankCode,
            bankNumber: a.bankNumber,
            accountName: a.nameTh,
            accountNameEn: a.nameEn,
            bankName:
              banks.find((b) => b.code === a.bankCode)?.nameTh || a.bankCode,
          })),
      });
    }),
  );
  app.post(
    "/api/admin/merchant-accounts",
    ...owner,
    csrf,
    asyncRoute(async (req, res) => {
      const v = z
        .object({
          bankAccountId: z.number().int().positive(),
          label: z.string().trim().min(1).max(100),
          visible: z.boolean(),
          isPrimary: z.boolean(),
        })
        .strict()
        .parse(req.body);
      const credentialHash = hash(secret(db, "easyslipApiKey", config));
      const [all, banks] = await Promise.all([
        branchAccounts(db, config),
        easyRequest(db, config, "banks"),
      ]);
      const branch = all.find(
        (a) => a.id === v.bankAccountId && /^\d{3}$/.test(a.bankCode),
      );
      if (
        !branch ||
        !/^\d{10,15}$/.test(digits(branch.bankNumber)) ||
        !name(branch.nameTh) ||
        !name(branch.nameEn)
      )
        fail(
          422,
          "เลือกบัญชีธนาคารที่ลงทะเบียนชื่อไทยและอังกฤษครบ และเชื่อม Branch ของ EasySlip แล้ว",
        );
      if (!Array.isArray(banks)) fail(502, "ข้อมูลธนาคาร EasySlip ไม่สมบูรณ์");
      const aid = id();
      commitAccounts(
        db,
        req.user.id,
        "merchant_account.created",
        aid,
        (accounts) => {
          if (credentialHash !== hash(secret(db, "easyslipApiKey", config)))
            fail(409, "API key เปลี่ยน กรุณาลองใหม่");
          if (
            accounts.some(
              (a) =>
                a.bankCode === branch.bankCode &&
                digits(a.bankNumber) === digits(branch.bankNumber),
            )
          )
            fail(409, "บัญชีนี้อยู่ในบัญชีร้านค้าแล้ว");
          const a = {
            id: aid,
            label: v.label,
            bankCode: branch.bankCode,
            bankNumber: digits(branch.bankNumber),
            bankName:
              banks.find((b) => b.code === branch.bankCode)?.nameTh ||
              branch.bankCode,
            accountName: branch.nameTh,
            accountNameEn: branch.nameEn,
            visible: v.visible,
            isPrimary: v.isPrimary || !accounts.length,
            version: 1,
            qrs: [],
            createdAt: now(),
          };
          accounts.push(a);
          primaryAccount(accounts, a);
        },
      );
      res.status(201).json({ id: aid });
    }),
  );
  app.put(
    "/api/admin/merchant-accounts/:id",
    ...owner,
    csrf,
    asyncRoute((req, res) => {
      const v = editSchema.parse(req.body);
      commitAccounts(
        db,
        req.user.id,
        "merchant_account.updated",
        req.params.id,
        (accounts, s) => {
          const a = requireAccount(s, req.params.id);
          if (a.version !== v.version)
            fail(409, "บัญชีเปลี่ยนแล้ว กรุณาโหลดใหม่");
          const target = accounts.find((item) => item.id === a.id);
          Object.assign(target, {
            label: v.label,
            visible: v.visible,
            isPrimary: v.isPrimary,
            version: a.version + 1,
          });
          primaryAccount(accounts, target);
        },
      );
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/admin/merchant-accounts/:id/qrs",
    ...owner,
    csrf,
    asyncRoute((req, res) => {
      const v = editSchema
        .extend({ image: z.string().regex(/^\/api\/media\/[a-f0-9]{32}$/) })
        .parse(req.body);
      const qid = id();
      commitAccounts(
        db,
        req.user.id,
        "merchant_qr.created",
        req.params.id,
        (accounts, s) => {
          const a = requireAccount(s, req.params.id),
            target = accounts.find((item) => item.id === a.id);
          if (a.version !== v.version)
            fail(409, "บัญชีเปลี่ยนแล้ว กรุณาโหลดใหม่");
          if (a.qrs.length >= 10)
            fail(409, "เพิ่ม QR ได้สูงสุด 10 รูปต่อบัญชี");
          const check = db
            .prepare("SELECT * FROM payment_qr_checks WHERE media_id=?")
            .get(v.image.split("/").at(-1));
          if (!check || check.receiver !== receivingAccountKey(a))
            fail(422, "QR ยังไม่ผ่านการตรวจสอบสำหรับบัญชีนี้");
          const proof = JSON.parse(check.verification);
          if (
            proof.credentialHash !== hash(secret(db, "easyslipApiKey", config))
          )
            fail(409, "API key เปลี่ยน กรุณาอัปโหลด QR เพื่อตรวจสอบใหม่");
          if (
            accounts.some(
              (other) =>
                other.id !== a.id &&
                other.qrs.some(
                  (q) =>
                    q.verification?.promptpayIdentifier ===
                    proof.promptpayIdentifier,
                ),
            )
          )
            fail(409, "เลขพร้อมเพย์นี้ผูกกับบัญชีร้านค้าอื่นแล้ว");
          if (target.qrs.some((q) => q.image === v.image))
            fail(409, "รูป QR นี้อยู่ในบัญชีแล้ว");
          const primary = v.isPrimary || !target.qrs.length;
          if (primary)
            target.qrs.forEach((q) => {
              q.isPrimary = false;
            });
          target.qrs.push({
            id: qid,
            label: v.label,
            image: v.image,
            visible: v.visible,
            isPrimary: primary,
            verification: { ...proof, url: v.image },
            receiver: check.receiver,
          });
          target.version++;
        },
      );
      res.status(201).json({ id: qid });
    }),
  );
  app.put(
    "/api/admin/merchant-accounts/:id/qrs/:qrId",
    ...owner,
    csrf,
    asyncRoute((req, res) => {
      const v = editSchema.parse(req.body);
      commitAccounts(
        db,
        req.user.id,
        "merchant_qr.updated",
        req.params.id,
        (accounts, s) => {
          const a = requireAccount(s, req.params.id),
            target = accounts.find((item) => item.id === a.id);
          if (a.version !== v.version)
            fail(409, "บัญชีเปลี่ยนแล้ว กรุณาโหลดใหม่");
          const q = target.qrs.find((q) => q.id === req.params.qrId);
          if (!q) fail(404, "ไม่พบ QR รับเงิน");
          if (v.isPrimary)
            target.qrs.forEach((item) => {
              item.isPrimary = false;
            });
          Object.assign(q, {
            label: v.label,
            visible: v.visible,
            isPrimary: v.isPrimary,
          });
          target.version++;
        },
      );
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/admin/merchant-accounts/:id/qrs/:qrId/verify",
    ...owner,
    csrf,
    asyncRoute(async (req, res) => {
      const v = z
        .object({ version: z.number().int().positive() })
        .strict()
        .parse(req.body);
      const s = getSettings(db),
        a = requireAccount(s, req.params.id);
      if (a.version !== v.version) fail(409, "บัญชีเปลี่ยนแล้ว กรุณาโหลดใหม่");
      const qr = a.qrs.find((q) => q.id === req.params.qrId);
      if (!qr) fail(404, "ไม่พบ QR รับเงิน");
      const media = db
        .prepare("SELECT body FROM media WHERE id=? AND kind='paymentQr'")
        .get(qr.image.split("/").at(-1));
      if (!media) fail(422, "ไม่พบรูป QR เดิม กรุณาอัปโหลดใหม่");
      const proof = await verifyPaymentQr(
        db,
        config,
        Buffer.from(media.body),
        accountReceiver(s, a),
      );
      commitAccounts(
        db,
        req.user.id,
        "merchant_qr.reverified",
        a.id,
        (accounts, live) => {
          const target = requireAccount(live, a.id),
            q = target.qrs.find((q) => q.id === qr.id);
          if (
            target.version !== v.version ||
            !q ||
            q.image !== qr.image ||
            receivingAccountKey(target) !== receivingAccountKey(a) ||
            proof.credentialHash !== hash(secret(db, "easyslipApiKey", config))
          )
            fail(409, "บัญชีหรือ API key เปลี่ยนระหว่างตรวจสอบ กรุณาลองใหม่");
          if (
            accounts.some(
              (other) =>
                other.id !== a.id &&
                other.qrs.some(
                  (item) =>
                    item.verification?.promptpayIdentifier ===
                    proof.promptpayIdentifier,
                ),
            )
          )
            fail(409, "เลขพร้อมเพย์นี้ผูกกับบัญชีร้านค้าอื่นแล้ว");
          Object.assign(q, {
            verification: { ...proof, url: q.image },
            receiver: receivingAccountKey(target),
          });
          const current = accounts.find((item) => item.id === target.id);
          // Legacy accounts are materialized only inside this owner mutation.
          if (current !== target)
            Object.assign(
              current.qrs.find((item) => item.id === qr.id),
              q,
            );
          current.version++;
        },
      );
      res.json({ ok: true });
    }),
  );
}
