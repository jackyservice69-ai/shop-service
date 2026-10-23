import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fixture,
  addProduct,
  addUser,
  orderInput,
  slip,
  bank,
} from "./helpers.mjs";
import {
  id,
  wallet,
  verifyAudit,
  audit,
  encrypt,
  decrypt,
  transaction,
  setSetting,
} from "../server/db.mjs";
import {
  createOrder as rawCreateOrder,
  cancelOrder,
  payOrder,
  quote,
  validateSlip,
  creditTopup,
} from "../server/commerce.mjs";

const createOrder = (db, uid, input, key) =>
  rawCreateOrder(
    db,
    uid,
    {
      ...input,
      expectedQuote: input.expectedQuote || quote(db, uid, input).fingerprint,
    },
    key,
  );
test("full payment debits exact satang, reserves stock, immutable ledger and valid audit", () => {
  const f = fixture();
  wallet(f.db, f.customer.id, 100000, "opening-test", id());
  const o = createOrder(f.db, f.customer.id, orderInput(f.product), id());
  assert.equal(o.total, 10000);
  assert.equal(o.paid, 10000);
  assert.equal(o.status, "paid");
  assert.equal(
    f.db.prepare("SELECT balance FROM users WHERE id=?").get(f.customer.id)
      .balance,
    90000,
  );
  assert.equal(
    f.db.prepare("SELECT stock FROM products WHERE id=?").get(f.product.id)
      .stock,
    9,
  );
  assert.throws(() => f.db.exec("UPDATE ledger SET amount=999"), /immutable/);
  assert.ok(verifyAudit(f.db).valid);
  f.db.close();
});
test("0% reservation never debits wallet; settle once then refund once", () => {
  const f = fixture();
  const o = createOrder(
    f.db,
    f.customer.id,
    orderInput(f.product, { payment: "deposit" }),
    id(),
  );
  assert.equal(o.paid, 0);
  assert.equal(o.status, "reserved");
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM ledger").get().n, 0);
  wallet(f.db, f.customer.id, 20000, "opening-test", id());
  payOrder(f.db, f.customer.id, o.id);
  payOrder(f.db, f.customer.id, o.id);
  assert.equal(
    f.db.prepare("SELECT balance FROM users WHERE id=?").get(f.customer.id)
      .balance,
    10000,
  );
  cancelOrder(f.db, f.customer.id, o.id);
  cancelOrder(f.db, f.customer.id, o.id);
  assert.equal(
    f.db.prepare("SELECT balance FROM users WHERE id=?").get(f.customer.id)
      .balance,
    20000,
  );
  assert.equal(
    f.db.prepare("SELECT stock FROM products WHERE id=?").get(f.product.id)
      .stock,
    10,
  );
  assert.throws(() => payOrder(f.db, f.customer.id, o.id), /ยกเลิก/);
  f.db.close();
});
test("partial deposit uses upward satang rounding and refund is limited to money actually paid", () => {
  const f = fixture();
  setSetting(f.db, "depositPercent", 15);
  const p = addProduct(f.db, 3, 10001);
  wallet(f.db, f.customer.id, 5000, "opening-test", id());
  const o = createOrder(
    f.db,
    f.customer.id,
    orderInput(p, { payment: "deposit" }),
    id(),
  );
  assert.equal(o.paid, 1501);
  cancelOrder(f.db, f.customer.id, o.id);
  assert.equal(
    f.db.prepare("SELECT balance FROM users WHERE id=?").get(f.customer.id)
      .balance,
    5000,
  );
  f.db.close();
});
test("insufficient funds rolls back order, stock, ledger and audit together", () => {
  const f = fixture();
  assert.throws(
    () => createOrder(f.db, f.customer.id, orderInput(f.product), id()),
    /ยอดเงิน/,
  );
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM orders").get().n, 0);
  assert.equal(
    f.db.prepare("SELECT stock FROM products WHERE id=?").get(f.product.id)
      .stock,
    10,
  );
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM audit").get().n, 0);
  f.db.close();
});
test("order replay is idempotent; same request key with different payload is rejected", () => {
  const f = fixture(),
    input = orderInput(f.product, { payment: "deposit" }),
    key = id();
  input.expectedQuote = quote(f.db, f.customer.id, input).fingerprint;
  const a = createOrder(f.db, f.customer.id, input, key),
    b = createOrder(f.db, f.customer.id, input, key);
  assert.equal(a.id, b.id);
  assert.equal(
    f.db.prepare("SELECT stock FROM products WHERE id=?").get(f.product.id)
      .stock,
    9,
  );
  assert.throws(
    () => createOrder(f.db, f.customer.id, { ...input, coupon: "OTHER" }, key),
    /รหัสคำขอ/,
  );
  f.db.close();
});
test("stock exhaustion and duplicate product lines cannot over-reserve", () => {
  const f = fixture(),
    p = addProduct(f.db, 1);
  const input = orderInput(p, { payment: "deposit" });
  createOrder(f.db, f.customer.id, input, id());
  assert.throws(() => createOrder(f.db, f.other.id, input, id()), /ไม่พอ/);
  assert.throws(
    () =>
      quote(f.db, f.customer.id, {
        ...orderInput(f.product),
        items: [
          { productId: f.product.id, quantity: 1 },
          { productId: f.product.id, quantity: 1 },
        ],
      }),
    /ซ้ำ/,
  );
  f.db.close();
});
test("product prices and totals are calculated on server, not trusted from client", () => {
  const f = fixture();
  const q = quote(f.db, f.customer.id, {
    ...orderInput(f.product),
    total: 1,
    items: [{ productId: f.product.id, quantity: 2, price: 1 }],
  });
  assert.equal(q.total, 20000);
  f.db.close();
});
test("coupon expiry, minimum, user/global limits and cancellation release", () => {
  const f = fixture();
  const pid = id();
  f.db
    .prepare(
      "INSERT INTO promotions(id,code,type,value,minimum,limit_count,per_user,starts_at,ends_at) VALUES(?,?,?,?,?,?,?,?,?)",
    )
    .run(
      pid,
      "SAVE10",
      "percent",
      10,
      10000,
      1,
      1,
      "2020-01-01T00:00:00.000Z",
      "2099-01-01T00:00:00.000Z",
    );
  const input = orderInput(f.product, { coupon: "save10", payment: "deposit" });
  const q = quote(f.db, f.customer.id, input);
  assert.equal(q.discount, 1000);
  const o = createOrder(f.db, f.customer.id, input, id());
  assert.throws(() => quote(f.db, f.other.id, input), /ครบจำนวน/);
  cancelOrder(f.db, f.customer.id, o.id);
  assert.equal(quote(f.db, f.other.id, input).discount, 1000);
  f.db
    .prepare("UPDATE promotions SET ends_at='2021-01-01T00:00:00.000Z'")
    .run();
  assert.throws(() => quote(f.db, f.other.id, input), /หมดอายุ/);
  f.db.close();
});
test("fixed coupon never makes total negative", () => {
  const f = fixture();
  f.db
    .prepare(
      "INSERT INTO promotions(id,code,type,value,minimum,limit_count,per_user,starts_at,ends_at) VALUES(?,?,?,?,?,?,?,?,?)",
    )
    .run(
      id(),
      "FREE",
      "fixed",
      50000,
      0,
      5,
      1,
      "2020-01-01T00:00:00.000Z",
      "2099-01-01T00:00:00.000Z",
    );
  assert.equal(
    quote(f.db, f.customer.id, orderInput(f.product, { coupon: "FREE" })).total,
    0,
  );
  f.db.close();
});
test("customer cannot settle/cancel another customer order", () => {
  const f = fixture(),
    o = createOrder(
      f.db,
      f.customer.id,
      orderInput(f.product, { payment: "deposit" }),
      id(),
    );
  assert.throws(() => payOrder(f.db, f.other.id, o.id), /ไม่พบ/);
  assert.throws(() => cancelOrder(f.db, f.other.id, o.id), /ไม่พบ/);
  f.db.close();
});
test("shipped order cannot be cancelled/refunded", () => {
  const f = fixture(),
    o = createOrder(
      f.db,
      f.customer.id,
      orderInput(f.product, { payment: "deposit" }),
      id(),
    );
  f.db.prepare("UPDATE orders SET status='shipped' WHERE id=?").run(o.id);
  assert.throws(() => cancelOrder(f.db, f.customer.id, o.id), /จัดส่งแล้ว/);
  f.db.close();
});
test("verified topup credits once across customers, unique transaction ref and image", () => {
  const f = fixture(),
    data = slip(),
    image = id();
  const top = creditTopup(f.db, f.customer.id, id(), image, 10000, data, bank);
  assert.ok(top.id);
  assert.equal(
    f.db.prepare("SELECT balance FROM users WHERE id=?").get(f.customer.id)
      .balance,
    10000,
  );
  assert.throws(
    () => creditTopup(f.db, f.other.id, id(), id(), 10000, data, bank),
    /สลิปนี้/,
  );
  assert.throws(
    () => creditTopup(f.db, f.other.id, id(), image, 10000, slip(), bank),
    /สลิปนี้/,
  );
  assert.ok(verifyAudit(f.db).valid);
  f.db.close();
});
for (const [name, change] of [
  ["provider duplicate", (s) => (s.isDuplicate = true)],
  ["missing duplicate verdict", (s) => delete s.isDuplicate],
  ["wrong account", (s) => (s.matchedAccount.bankNumber = "9999999999")],
  ["wrong bank", (s) => (s.matchedAccount.bank.code = "004")],
  [
    "wrong name",
    (s) => {
      s.matchedAccount.nameTh = "คนอื่น";
      s.matchedAccount.nameEn = "other";
    },
  ],
  ["unmatched account", (s) => (s.matchedAccount = null)],
  ["wrong amount", (s) => (s.amountInSlip = 99)],
  ["missing amount match", (s) => delete s.isAmountMatched],
  ["mismatched raw amount", (s) => (s.rawSlip.amount.amount = 98)],
  ["old slip", (s) => (s.rawSlip.date = "2020-01-01T00:00:00Z")],
  [
    "future slip",
    (s) => (s.rawSlip.date = new Date(Date.now() + 3600000).toISOString()),
  ],
  ["foreign currency", (s) => (s.rawSlip.amount.local.currency = "USD")],
  ["missing transaction reference", (s) => (s.rawSlip.transRef = "")],
  ["invalid timestamp", (s) => (s.rawSlip.date = "bad")],
])
  test("slip rejects " + name, () => {
    const data = slip();
    change(data);
    assert.throws(() => validateSlip(data, 10000, bank));
  });
test("audit cannot update/delete and independent hash check detects tampering", () => {
  const f = fixture();
  audit(f.db, f.admin.id, "test", "one", { x: 1 });
  assert.ok(verifyAudit(f.db).valid);
  assert.throws(() => f.db.exec("DELETE FROM audit"), /immutable/);
  assert.throws(() => f.db.exec("UPDATE audit SET details='{}'"), /immutable/);
  f.db.exec("DROP TRIGGER audit_immutable_update");
  f.db.exec("UPDATE audit SET details='{}'");
  assert.equal(verifyAudit(f.db).valid, false);
  f.db.close();
});
test("AES-GCM secrets round trip and reject wrong key/tampering", () => {
  const key = "ab".repeat(32),
    encrypted = encrypt("secret-value", key);
  assert.equal(decrypt(encrypted, key), "secret-value");
  assert.ok(!encrypted.includes("secret-value"));
  assert.throws(() => decrypt(encrypted, "cd".repeat(32)));
  assert.throws(() => decrypt(encrypted.slice(0, -3) + "aaa", key));
});
test("database transaction rollback preserves all invariants after thrown error", () => {
  const f = fixture();
  assert.throws(() =>
    transaction(f.db, () => {
      wallet(f.db, f.customer.id, 10000, "opening-test", id());
      throw new Error("failure");
    }),
  );
  assert.equal(
    f.db.prepare("SELECT balance FROM users WHERE id=?").get(f.customer.id)
      .balance,
    0,
  );
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM ledger").get().n, 0);
  f.db.close();
});
