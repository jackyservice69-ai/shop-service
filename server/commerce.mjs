import { z } from "zod";
import { snapshotConsignments } from "./consignment-ledger.mjs";
import { isAuthorizedPromptpayResponse } from "./receiving-policy.mjs";
import { receivingCandidates } from "./merchant-account-policy.mjs";
import {
  id,
  now,
  hash,
  transaction,
  audit,
  wallet,
  getSettings,
  bankTransferKey,
} from "./db.mjs";
export const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
export const money = z.number().int().min(0).max(100000000);
export const cartSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .min(1)
    .max(50),
  coupon: z.string().trim().max(40).default(""),
  payment: z.enum(["full", "deposit"]).default("full"),
});
export const checkoutSchema = cartSchema.extend({
  expectedQuote: z
    .string()
    .regex(/^[a-f0-9]{64}$/, "กรุณาคำนวณยอดใหม่ก่อนยืนยัน"),
  shipping: z
    .object({
      name: z.string().trim().min(2).max(100),
      phone: z
        .string()
        .regex(/^0\d{8,9}$/, "เบอร์โทรต้องมี 9–10 หลักและเริ่มด้วย 0"),
      address: z.string().trim().min(10).max(1000),
      latitude: z.number().finite().min(-90).max(90).nullable().optional(),
      longitude: z.number().finite().min(-180).max(180).nullable().optional(),
    })
    .refine(
      (v) => (v.latitude == null) === (v.longitude == null),
      "กรุณาระบุพิกัดให้ครบ",
    ),
});
export function quote(db, userId, input) {
  const seen = new Set();
  const items = input.items.map((item) => {
    if (seen.has(item.productId)) fail(400, "สินค้าซ้ำในรายการ");
    seen.add(item.productId);
    const p = db
      .prepare("SELECT * FROM products WHERE id=? AND active=1")
      .get(item.productId);
    if (!p || p.stock < item.quantity)
      fail(409, "สินค้าไม่พร้อมจำหน่ายหรือจำนวนคงเหลือไม่พอ");
    if (p.consignor_id) {
      if (p.consignor_id === userId)
        fail(409, "ไม่สามารถสั่งซื้อสินค้าที่ตนเองฝากขายได้");
      const seller = db
        .prepare(
          "SELECT c.status,u.active FROM consignors c JOIN users u ON u.id=c.user_id WHERE c.user_id=?",
        )
        .get(p.consignor_id);
      if (!seller || seller.status !== "approved" || !seller.active)
        fail(409, "ตัวแทนฝากขายไม่พร้อมจำหน่าย");
    }
    return {
      ...item,
      name: p.name,
      price: p.price,
      cost: p.consignor_id ? 0 : p.cost,
      total: p.price * item.quantity,
    };
  });
  const subtotal = items.reduce((s, p) => s + p.total, 0);
  if (subtotal > 100000000) fail(400, "ยอดสั่งซื้อเกินขีดจำกัด");
  let discount = 0,
    promo = null;
  if (input.coupon) {
    promo = db
      .prepare(
        "SELECT * FROM promotions WHERE code=? COLLATE NOCASE AND active=1",
      )
      .get(input.coupon);
    const date = now();
    if (
      !promo ||
      date < promo.starts_at ||
      date > promo.ends_at ||
      subtotal < promo.minimum
    )
      fail(400, "โค้ดไม่ถูกต้อง หมดอายุ หรือยอดซื้อไม่ถึงขั้นต่ำ");
    const global = db
      .prepare(
        "SELECT COUNT(*) n FROM orders WHERE promotion_id=? AND status!='cancelled'",
      )
      .get(promo.id).n;
    const personal = db
      .prepare(
        "SELECT COUNT(*) n FROM orders WHERE promotion_id=? AND user_id=? AND status!='cancelled'",
      )
      .get(promo.id, userId).n;
    if (global >= promo.limit_count || personal >= promo.per_user)
      fail(409, "โค้ดนี้ถูกใช้ครบจำนวนแล้ว");
    if (
      promo.claim_required &&
      !db
        .prepare(
          "SELECT 1 FROM coupon_claims WHERE user_id=? AND promotion_id=?",
        )
        .get(userId, promo.id)
    )
      fail(400, "กรุณาเก็บคูปองก่อนใช้ส่วนลด");
    discount = Math.min(
      subtotal,
      promo.type === "percent"
        ? Math.floor((subtotal * promo.value) / 100)
        : promo.value,
    );
  }
  const total = subtotal - discount,
    percent = input.payment === "full" ? 100 : getSettings(db).depositPercent,
    payNow = Math.ceil((total * percent) / 100);
  const result = {
    items,
    subtotal,
    discount,
    total,
    payNow,
    due: total - payNow,
    depositPercent: percent,
    promotionId: promo?.id || null,
  };
  return {
    ...result,
    fingerprint: hash(
      JSON.stringify([
        items.map((p) => [p.productId, p.name, p.quantity, p.price]),
        subtotal,
        discount,
        total,
        payNow,
        percent,
        promo?.id || null,
      ]),
    ),
  };
}
export function createOrder(db, userId, input, key) {
  return transaction(db, () => {
    const digest = hash(JSON.stringify(input)),
      existing = db
        .prepare("SELECT * FROM orders WHERE user_id=? AND request_key=?")
        .get(userId, key);
    if (existing) {
      if (existing.request_hash !== digest)
        fail(409, "รหัสคำขอถูกใช้กับข้อมูลอื่นแล้ว");
      return existing;
    }
    const q = quote(db, userId, input);
    if (input.expectedQuote !== q.fingerprint)
      fail(
        409,
        "ราคา ส่วนลด หรือมัดจำเปลี่ยนแล้ว กรุณาปิดหน้าต่างและตรวจสอบยอดใหม่ก่อนยืนยัน",
      );
    const orderId = id();
    db.prepare(
      "INSERT INTO orders(id,user_id,request_key,request_hash,subtotal,discount,total,paid,deposit_percent,status,promotion_id,shipping,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ).run(
      orderId,
      userId,
      key,
      digest,
      q.subtotal,
      q.discount,
      q.total,
      q.payNow,
      q.depositPercent,
      q.due === 0 ? "paid" : "reserved",
      q.promotionId,
      JSON.stringify(input.shipping),
      now(),
    );
    for (const p of q.items) {
      const r = db
        .prepare(
          "UPDATE products SET stock=stock-?,version=version+1 WHERE id=? AND stock>=? AND active=1",
        )
        .run(p.quantity, p.productId, p.quantity);
      if (!r.changes) fail(409, "สินค้าคงเหลือไม่พอ");
      db.prepare("INSERT INTO order_items VALUES(?,?,?,?,?,?)").run(
        orderId,
        p.productId,
        p.name,
        p.price,
        p.cost,
        p.quantity,
      );
    }
    snapshotConsignments(db, orderId, userId, q);
    if (q.payNow) wallet(db, userId, -q.payNow, "purchase", orderId);
    const buyer = db
        .prepare("SELECT referred_by FROM users WHERE id=?")
        .get(userId),
      rate = Math.round(getSettings(db).commissionPercent * 100);
    if (buyer.referred_by && buyer.referred_by !== userId) {
      const commission = Math.floor((q.total * rate) / 10000);
      db.prepare(
        "UPDATE orders SET referrer_id=?,commission_bps=?,commission_amount=? WHERE id=?",
      ).run(buyer.referred_by, rate, commission, orderId);
      if (commission > 0)
        db.prepare("INSERT INTO commissions VALUES(?,?,?,?,?,?,?,?)").run(
          orderId,
          buyer.referred_by,
          rate,
          q.total,
          commission,
          "pending",
          now(),
          null,
        );
    }
    audit(db, userId, "order.created", orderId, {
      total: q.total,
      paid: q.payNow,
    });
    return db.prepare("SELECT * FROM orders WHERE id=?").get(orderId);
  });
}
export function payOrder(db, userId, orderId) {
  return transaction(db, () => {
    const o = db
      .prepare("SELECT * FROM orders WHERE id=? AND user_id=?")
      .get(orderId, userId);
    if (!o) fail(404, "ไม่พบคำสั่งซื้อ");
    if (o.status === "cancelled") fail(409, "คำสั่งซื้อถูกยกเลิกแล้ว");
    if (o.paid === o.total) return o;
    wallet(db, userId, -(o.total - o.paid), "settlement", o.id);
    db.prepare("UPDATE orders SET paid=total,status='paid' WHERE id=?").run(
      o.id,
    );
    audit(db, userId, "order.settled", o.id, { amount: o.total - o.paid });
    return db.prepare("SELECT * FROM orders WHERE id=?").get(o.id);
  });
}
export function cancelOrder(db, actor, orderId, isAdmin = false) {
  return transaction(db, () => {
    const o = db.prepare("SELECT * FROM orders WHERE id=?").get(orderId);
    if (!o || (!isAdmin && o.user_id !== actor)) fail(404, "ไม่พบคำสั่งซื้อ");
    if (o.status === "cancelled") return o;
    if (["shipped", "completed"].includes(o.status))
      fail(409, "ยกเลิกสินค้าที่จัดส่งแล้วไม่ได้");
    if (o.paid) wallet(db, o.user_id, o.paid, "refund", o.id);
    for (const p of db
      .prepare("SELECT * FROM order_items WHERE order_id=?")
      .all(o.id))
      db.prepare(
        "UPDATE products SET stock=stock+?,version=version+1 WHERE id=?",
      ).run(p.quantity, p.product_id);
    db.prepare("UPDATE orders SET status='cancelled' WHERE id=?").run(o.id);
    db.prepare(
      "UPDATE commissions SET status='void' WHERE order_id=? AND status='pending'",
    ).run(o.id);
    db.prepare(
      "UPDATE consignment_sales SET status='void' WHERE order_id=? AND status='pending'",
    ).run(o.id);
    audit(db, actor, "order.cancelled", o.id, { refund: o.paid });
    return db.prepare("SELECT * FROM orders WHERE id=?").get(o.id);
  });
}
// Called within the same transaction as completion. A unique ledger reference
// and conditional status update make retries incapable of double paying.
export function settleCommission(db, orderId) {
  const o = db.prepare("SELECT * FROM orders WHERE id=?").get(orderId),
    c = db.prepare("SELECT * FROM commissions WHERE order_id=?").get(orderId);
  if (!c || c.status !== "pending") return;
  if (o.status !== "completed" || o.paid !== o.total)
    fail(409, "จ่ายคอมมิชชั่นได้เมื่อคำสั่งซื้อสำเร็จและชำระครบเท่านั้น");
  wallet(db, c.referrer_id, c.amount, "commission", orderId);
  db.prepare(
    "UPDATE commissions SET status='credited',paid_at=? WHERE order_id=? AND status='pending'",
  ).run(now(), orderId);
  audit(db, null, "commission.credited", orderId, {
    referrer: c.referrer_id,
    amount: c.amount,
    rateBps: c.rate_bps,
  });
}
export function validateSlip(
  data,
  expected,
  settings,
  at = Date.now(),
  amountFromSlip = false,
) {
  if (!data || data.isDuplicate !== false)
    fail(409, "สลิปนี้ถูกใช้งานแล้วหรือไม่ยืนยันสถานะซ้ำ");
  const matched = data.matchedAccount;
  const digits = (s) => String(s || "").replace(/[^0-9]/g, "");
  const receiver =
    matched &&
    receivingCandidates(settings).find(
      (candidate) =>
        (matched.bank?.code === candidate.bankCode &&
          digits(matched.bankNumber) === digits(candidate.bankNumber)) ||
        isAuthorizedPromptpayResponse(data, candidate),
    );
  if (!receiver) fail(422, "บัญชีผู้รับไม่ตรงกับบัญชีของร้าน");
  const name = (s) =>
    String(s || "")
      .normalize("NFKC")
      .replace(/\s/g, "")
      .toLowerCase();
  if (
    ![receiver.accountName, receiver.accountNameEn]
      .filter(Boolean)
      .some((n) =>
        [matched.nameTh, matched.nameEn]
          .filter(Boolean)
          .some((m) => name(m) === name(n)),
      )
  )
    fail(422, "ชื่อบัญชีผู้รับไม่ตรงกับที่ร้านกำหนด");
  if (
    (!amountFromSlip && data.isAmountMatched !== true) ||
    (amountFromSlip && data.isAmountMatched === false) ||
    !Number.isSafeInteger(expected) ||
    expected <= 0 ||
    expected > 100000000 ||
    Math.round(Number(data.amountInSlip) * 100) !== expected ||
    Math.round(Number(data.rawSlip?.amount?.amount) * 100) !== expected
  )
    fail(422, "ยอดเงินในสลิปไม่ตรงกับยอดเติม");
  const raw = data.rawSlip,
    ts = Date.parse(raw?.date);
  if (!Number.isFinite(ts) || at - ts > 24 * 3600000 || ts > at + 300000)
    fail(422, "สลิปต้องเป็นรายการภายใน 24 ชั่วโมงและเวลาไม่เกินปัจจุบัน");
  if (
    raw.countryCode !== "TH" ||
    raw.amount?.local?.currency !== "THB" ||
    !raw.transRef ||
    !raw.sender?.bank?.id
  )
    fail(422, "ข้อมูลสลิปไม่สมบูรณ์หรือสกุลเงินไม่ใช่บาท");
  return `${raw.sender.bank.id}:${raw.transRef}`;
}
export function creditTopup(
  db,
  userId,
  key,
  imageHash,
  amount,
  verified,
  settings,
  lineContext = null,
) {
  const bankRef = validateSlip(
    verified,
    amount,
    settings,
    Date.now(),
    !!lineContext,
  );
  return transaction(db, () => {
    validateSlip(verified, amount, getSettings(db), Date.now(), !!lineContext);
    if (lineContext) {
      const live = getSettings(db);
      const binding = db
        .prepare(
          "SELECT l.*,u.active,u.role_id,u.must_change_password FROM line_identities l JOIN users u ON u.id=l.user_id WHERE l.user_id=? AND l.binding_id=?",
        )
        .get(userId, lineContext.bindingId);
      if (
        !binding ||
        !binding.active ||
        binding.role_id !== "customer" ||
        binding.must_change_password ||
        !live.botEnabled ||
        !live.lineTopupEnabled ||
        !live.lineLoginEnabled ||
        binding.channel_id !== live.lineLoginChannelId
      )
        fail(409, "การเชื่อมต่อ LINE เปลี่ยนแล้ว กรุณาเชื่อมต่ออีกครั้ง");
      validateSlip(verified, amount, live, Date.now(), true);
    }
    if (
      db
        .prepare("SELECT reference FROM funding_receipts WHERE bank_ref=?")
        .get(bankTransferKey(bankRef))
    )
      fail(409, "รายการโอนในสลิปนี้ถูกเติมเงินแล้วจากสลิปหรือหลังบ้าน");
    if (
      db
        .prepare("SELECT id FROM topups WHERE bank_ref=? OR image_hash=?")
        .get(bankRef, imageHash)
    )
      fail(409, "สลิปนี้ถูกเติมเงินแล้ว");
    const tid = id();
    db.prepare("INSERT INTO funding_receipts VALUES(?,?,?,?)").run(
      bankTransferKey(bankRef),
      "slip",
      tid,
      now(),
    );
    db.prepare("INSERT INTO topups VALUES(?,?,?,?,?,?,?)").run(
      tid,
      userId,
      key,
      imageHash,
      bankRef,
      amount,
      now(),
    );
    wallet(db, userId, amount, "topup", tid);
    audit(db, userId, "wallet.topup", tid, { amount, bankRef });
    if (lineContext) {
      db.prepare("INSERT INTO line_topups VALUES(?,?,?)").run(
        lineContext.eventId,
        tid,
        now(),
      );
      const balance = db
        .prepare("SELECT balance FROM users WHERE id=?")
        .get(userId).balance;
      const baht = (value) =>
        (value / 100).toLocaleString("th-TH", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      const reply = `เติมเงินสำเร็จ ${baht(amount)} บาท ยอดกระเป๋าเงิน ${baht(balance)} บาท เลขรายการ ${tid} ตรวจสอบประวัติได้ในเว็บไซต์ของร้าน`;
      db.prepare("UPDATE webhook_events SET reply_text=? WHERE id=?").run(
        reply,
        lineContext.eventId,
      );
      audit(db, userId, "wallet.line_topup", tid, {
        amount,
        eventId: lineContext.eventId,
      });
    }
    return { id: tid, amount };
  });
}
