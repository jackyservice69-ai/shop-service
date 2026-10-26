import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { mkdtempSync, rmSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  fixture,
  addUser,
  addProduct,
  login,
  mutate,
  orderInput,
} from "./helpers.mjs";
import {
  id,
  now,
  openDb,
  wallet,
  transaction,
  setSetting,
  verifyAudit,
} from "../server/db.mjs";
import { quote, createOrder } from "../server/commerce.mjs";
import { settleConsignments } from "../server/consignment-ledger.mjs";

function shop(db, user, name = "ร้านตัวแทน") {
  db.prepare(
    "INSERT INTO consignors(user_id,shop_name,status,created_at,updated_at) VALUES(?,?,'approved',?,?)",
  ).run(user.id, name, now(), now());
}
function own(db, product, user) {
  db.prepare(
    "UPDATE products SET consignor_id=?,consignment_status='approved' WHERE id=?",
  ).run(user.id, product.id);
}
const fee = (client, uid, rate, version) =>
  mutate(
    client,
    "/api/admin/consignments/" + uid,
    { status: "approved", note: "", version, feePercent: rate },
    "put",
  );

test("shop-specific fees are owner-controlled, validate precision, preserve omitted values, and reset to the current default", async () => {
  const f = fixture();
  try {
    shop(f.db, f.other);
    setSetting(f.db, "consignmentFeePercent", 12);
    f.db
      .prepare("INSERT INTO roles VALUES(?,?,?)")
      .run("fee-staff", "เจ้าหน้าที่ฝากขาย", '["consignments"]');
    const a = await login(f.app, f.admin),
      seller = await login(f.app, f.other),
      staff = await login(f.app, addUser(f.db, "fee-staff"));
    assert.equal(
      (
        await request(f.app)
          .put("/api/admin/consignments/" + f.other.id)
          .send({})
      ).status,
      401,
    );
    assert.equal((await fee(seller, f.other.id, 0, 1)).status, 403);
    for (const rate of [0, 7.25, null])
      assert.equal((await fee(staff, f.other.id, rate, 1)).status, 403);
    assert.equal(
      (
        await a.agent
          .put("/api/admin/consignments/" + f.other.id)
          .send({ status: "approved", note: "", version: 1, feePercent: 0 })
      ).status,
      403,
    );
    for (const rate of [-1, 100.01, 1.234, "7.25", true])
      assert.equal((await fee(a, f.other.id, rate, 1)).status, 400);
    assert.equal((await fee(a, f.other.id, 7.25, 1)).status, 200);
    assert.equal(
      f.db
        .prepare("SELECT fee_bps FROM consignors WHERE user_id=?")
        .get(f.other.id).fee_bps,
      725,
    );
    assert.equal(
      (await seller.agent.get("/api/consignment")).body.feePercent,
      7.25,
    );
    assert.equal((await fee(a, f.other.id, 80, 1)).status, 409);
    assert.equal(
      (
        await mutate(
          staff,
          "/api/admin/consignments/" + f.other.id,
          { status: "approved", note: "เก็บอัตราเดิม", version: 2 },
          "put",
        )
      ).status,
      200,
    );
    assert.equal(
      (await seller.agent.get("/api/consignment")).body.feePercent,
      7.25,
    );
    assert.equal((await fee(a, f.other.id, 0, 3)).status, 200);
    assert.equal(
      (await seller.agent.get("/api/consignment")).body.feePercent,
      0,
    );
    setSetting(f.db, "consignmentFeePercent", 18.5);
    assert.equal(
      (await seller.agent.get("/api/consignment")).body.feePercent,
      0,
    );
    assert.equal((await fee(a, f.other.id, null, 4)).status, 200);
    const me = (await seller.agent.get("/api/consignment")).body;
    assert.equal(me.feePercent, 18.5);
    assert.equal(me.defaultFeePercent, 18.5);
    assert.equal(me.membership.fee_bps, null);
    const list = (await a.agent.get("/api/admin/consignments")).body;
    assert.equal(list.defaultFeePercent, 18.5);
    assert.ok(verifyAudit(f.db).valid);
  } finally {
    f.db.close();
  }
});

test("mixed-vendor discounted bills snapshot each shop's fee including zero; later changes and settlement cannot rewrite or double-credit old bills", async () => {
  const f = fixture();
  try {
    const s2 = addUser(f.db),
      s3 = addUser(f.db);
    for (const s of [f.other, s2, s3]) shop(f.db, s);
    const p1 = addProduct(f.db, 10, 101),
      p2 = addProduct(f.db, 10, 202),
      p3 = addProduct(f.db, 10, 303),
      store = addProduct(f.db, 10, 404);
    for (const [p, u] of [
      [p1, f.other],
      [p2, s2],
      [p3, s3],
    ])
      own(f.db, p, u);
    setSetting(f.db, "consignmentFeePercent", 12);
    wallet(f.db, f.customer.id, 10000, "opening-test", id());
    const a = await login(f.app, f.admin),
      buyer = await login(f.app, f.customer);
    await fee(a, f.other.id, 7.25, 1);
    await fee(a, s3.id, 0, 1);
    f.db
      .prepare(
        "INSERT INTO promotions(id,code,type,value,per_user,starts_at,ends_at) VALUES(?,?,'fixed',10,10,'2020','2099')",
      )
      .run(id(), "SHOPFEES");
    const input = orderInput(p1, {
      coupon: "SHOPFEES",
      items: [p1, p2, p3, store].map((p) => ({ productId: p.id, quantity: 1 })),
    });
    const created = await mutate(buyer, "/api/orders", input, "post", id());
    assert.equal(created.status, 201);
    const sale = (pid) =>
      f.db
        .prepare(
          "SELECT * FROM consignment_sales WHERE order_id=? AND product_id=?",
        )
        .get(created.body.id, pid);
    assert.deepEqual(
      [p1, p2, p3].map((p) => {
        const r = sale(p.id);
        return [r.base, r.fee_bps, r.fee, r.net];
      }),
      [
        [100, 725, 7, 93],
        [200, 1200, 24, 176],
        [300, 0, 0, 300],
      ],
    );
    const before = [p1, p2, p3].map((p) => ({ ...sale(p.id) }));
    await fee(a, f.other.id, 90, 2);
    await fee(a, s3.id, 100, 2);
    setSetting(f.db, "consignmentFeePercent", 80);
    assert.deepEqual(
      [p1, p2, p3].map((p) => ({ ...sale(p.id) })),
      before,
    );
    for (const status of ["processing", "shipped", "completed"])
      assert.equal(
        (
          await mutate(
            a,
            "/api/admin/orders/" + created.body.id,
            { status, tracking: "FEE-TEST" },
            "put",
          )
        ).status,
        200,
      );
    transaction(f.db, () => settleConsignments(f.db, created.body.id));
    assert.deepEqual(
      [f.other, s2, s3].map(
        (s) =>
          f.db.prepare("SELECT balance FROM users WHERE id=?").get(s.id)
            .balance,
      ),
      [93, 176, 300],
    );
    assert.equal(
      f.db
        .prepare("SELECT COUNT(*) n FROM ledger WHERE kind='consignment'")
        .get().n,
      3,
    );
    const newer = await mutate(
      buyer,
      "/api/orders",
      { ...input },
      "post",
      id(),
    );
    assert.equal(newer.status, 201);
    assert.deepEqual(
      [p1, p2, p3].map(
        (p) =>
          f.db
            .prepare(
              "SELECT fee_bps FROM consignment_sales WHERE order_id=? AND product_id=?",
            )
            .get(newer.body.id, p.id).fee_bps,
      ),
      [9000, 8000, 10000],
    );
    assert.ok(verifyAudit(f.db).valid);
  } finally {
    f.db.close();
  }
});

test("shop fee edits roll back status, version and products when their audit write fails", async () => {
  const f = fixture();
  try {
    shop(f.db, f.other);
    own(f.db, f.product, f.other);
    const a = await login(f.app, f.admin),
      old = {
        ...f.db
          .prepare("SELECT * FROM consignors WHERE user_id=?")
          .get(f.other.id),
      };
    f.db.exec(
      "CREATE TRIGGER fail_shop_fee BEFORE INSERT ON audit WHEN NEW.action='consignment.shop_fee_changed' BEGIN SELECT RAISE(ABORT,'test failure'); END;",
    );
    const result = await mutate(
      a,
      "/api/admin/consignments/" + f.other.id,
      { status: "suspended", note: "", version: 1, feePercent: 10 },
      "put",
    );
    assert.equal(result.status, 500);
    assert.deepEqual(
      {
        ...f.db
          .prepare("SELECT * FROM consignors WHERE user_id=?")
          .get(f.other.id),
      },
      old,
    );
    assert.equal(
      f.db.prepare("SELECT active FROM products WHERE id=?").get(f.product.id)
        .active,
      1,
    );
  } finally {
    f.db.close();
  }
});

test("v12 migration adds nullable fees while preserving existing bill snapshots and balances", () => {
  const folder = mkdtempSync(join(tmpdir(), "iya-shop-fees-")),
    path = join(folder, "isolated.sqlite");
  let db;
  try {
    db = openDb(path);
    const seller = addUser(db),
      buyer = addUser(db),
      product = addProduct(db);
    shop(db, seller);
    own(db, product, seller);
    setSetting(db, "consignmentFeePercent", 12.5);
    const input = orderInput(product, { payment: "deposit" });
    input.expectedQuote = quote(db, buyer.id, input).fingerprint;
    const order = createOrder(db, buyer.id, input, id());
    const before = {
      ...db
        .prepare("SELECT * FROM consignment_sales WHERE order_id=?")
        .get(order.id),
    };
    db.exec(
      "ALTER TABLE consignors DROP COLUMN fee_bps;PRAGMA user_version=11;",
    );
    db.close();
    db = openDb(path);
    assert.equal(db.prepare("PRAGMA user_version").get().user_version, 15);
    assert.equal(
      db
        .prepare("SELECT fee_bps FROM consignors WHERE user_id=?")
        .get(seller.id).fee_bps,
      null,
    );
    assert.deepEqual(
      {
        ...db
          .prepare("SELECT * FROM consignment_sales WHERE order_id=?")
          .get(order.id),
      },
      before,
    );
    assert.equal(
      db.prepare("SELECT balance FROM users WHERE id=?").get(seller.id).balance,
      0,
    );
    db.close();
    db = openDb(path);
    assert.equal(
      db
        .prepare(
          "SELECT COUNT(*) n FROM audit WHERE action='consignment.shop_fee_enabled'",
        )
        .get().n,
      2,
    );
  } finally {
    db?.close();
    for (const suffix of ["", "-wal", "-shm"])
      rmSync(path + suffix, { force: true });
    rmdirSync(folder);
  }
});
