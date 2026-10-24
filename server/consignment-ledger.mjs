import { now, wallet, audit, getSettings } from "./db.mjs";
const reject = (message) => {
  throw Object.assign(new Error(message), { status: 409 });
};
export function snapshotConsignments(db, orderId, buyerId, q) {
  const feeBps = Math.round(getSettings(db).consignmentFeePercent * 100);
  const parts = q.items.map((p) => {
    const gross = p.price * p.quantity,
      n = BigInt(q.discount) * BigInt(gross),
      d = BigInt(q.subtotal);
    return { p, gross, discount: Number(n / d), remainder: Number(n % d) };
  });
  let extra = q.discount - parts.reduce((s, p) => s + p.discount, 0);
  for (const part of [...parts].sort(
    (a, b) =>
      b.remainder - a.remainder || a.p.productId.localeCompare(b.p.productId),
  ))
    if (extra > 0) {
      part.discount++;
      extra--;
    }
  for (const part of parts) {
    const product = db
      .prepare("SELECT consignor_id FROM products WHERE id=?")
      .get(part.p.productId);
    if (!product.consignor_id) continue;
    if (product.consignor_id === buyerId)
      reject("ไม่สามารถสั่งซื้อสินค้าที่ตนเองฝากขายได้");
    const seller = db
      .prepare(
        "SELECT c.status,u.active FROM consignors c JOIN users u ON u.id=c.user_id WHERE c.user_id=?",
      )
      .get(product.consignor_id);
    if (!seller || seller.status !== "approved" || !seller.active)
      reject("ตัวแทนฝากขายไม่พร้อมจำหน่าย กรุณาคำนวณยอดใหม่");
    const base = part.gross - part.discount,
      fee = Number((BigInt(base) * BigInt(feeBps)) / 10000n);
    db.prepare("INSERT INTO consignment_sales VALUES(?,?,?,?,?,?,?,?,?,?)").run(
      orderId,
      part.p.productId,
      product.consignor_id,
      feeBps,
      base,
      fee,
      base - fee,
      "pending",
      now(),
      null,
    );
  }
}
export function settleConsignments(db, orderId) {
  const rows = db
    .prepare(
      "SELECT * FROM consignment_sales WHERE order_id=? AND status='pending'",
    )
    .all(orderId);
  if (!rows.length) return;
  const o = db
    .prepare("SELECT status,paid,total FROM orders WHERE id=?")
    .get(orderId);
  if (o.status !== "completed" || o.paid !== o.total)
    reject("จ่ายยอดฝากขายได้เมื่อออร์เดอร์สำเร็จและชำระครบเท่านั้น");
  for (const row of rows) {
    if (row.net)
      wallet(
        db,
        row.seller_id,
        row.net,
        "consignment",
        row.order_id + ":" + row.product_id,
      );
    db.prepare(
      "UPDATE consignment_sales SET status='credited',paid_at=? WHERE order_id=? AND product_id=? AND status='pending'",
    ).run(now(), orderId, row.product_id);
    audit(db, null, "consignment.credited", orderId, {
      sellerId: row.seller_id,
      productId: row.product_id,
      base: row.base,
      fee: row.fee,
      net: row.net,
      feeBps: row.fee_bps,
    });
  }
}
