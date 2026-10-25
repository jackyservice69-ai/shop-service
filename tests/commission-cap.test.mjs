import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, login, mutate, orderInput, addProduct } from "./helpers.mjs";
import {
  getSettings,
  id,
  setSetting,
  transaction,
  wallet,
  verifyAudit,
} from "../server/db.mjs";
import {
  quote,
  createOrder,
  settleCommission,
  cancelOrder,
} from "../server/commerce.mjs";

test("commission cap validates integer satang, preserves omitted cap and audits changes", async () => {
  const f = fixture();
  try {
    const owner = await login(f.app, f.admin),
      path = "/api/admin/commissions/settings";
    for (const cap of [-1, 0.5, "50000", 100000001])
      assert.equal(
        (
          await mutate(
            owner,
            path,
            { commissionPercent: 5, commissionCap: cap },
            "put",
          )
        ).status,
        400,
      );
    assert.equal(
      (
        await mutate(
          owner,
          path,
          { commissionPercent: 5, commissionCap: 50000 },
          "put",
        )
      ).status,
      200,
    );
    assert.equal((await owner.agent.get(path)).body.commissionCap, 50000);
    await mutate(owner, path, { commissionPercent: 6 }, "put");
    assert.equal(getSettings(f.db).commissionCap, 50000);
    const customer = await login(f.app, f.customer);
    assert.equal(
      (
        await mutate(
          customer,
          path,
          { commissionPercent: 100, commissionCap: null },
          "put",
        )
      ).status,
      403,
    );
    const audit = JSON.parse(
      f.db
        .prepare(
          "SELECT details FROM audit WHERE action='commission.settings.updated' ORDER BY id DESC LIMIT 1",
        )
        .get().details,
    );
    assert.equal(audit.previousCap, 50000);
    assert.equal(audit.commissionCap, 50000);
    assert.equal(verifyAudit(f.db).valid, true);
  } finally {
    f.db.close();
  }
});

test("5 percent commission is capped at 500 baht, snapshotted, and credited exactly once", () => {
  const f = fixture();
  try {
    f.db
      .prepare("UPDATE users SET referred_by=? WHERE id=?")
      .run(f.other.id, f.customer.id);
    setSetting(f.db, "commissionPercent", 5);
    setSetting(f.db, "commissionCap", 50000);
    const product = addProduct(f.db, 10, 2000000);
    wallet(f.db, f.customer.id, 2000000, "test-opening", id());
    const input = orderInput(product);
    input.expectedQuote = quote(f.db, f.customer.id, input).fingerprint;
    const order = createOrder(f.db, f.customer.id, input, id());
    assert.equal(order.commission_amount, 50000);
    assert.equal(order.commission_cap, 50000);
    setSetting(f.db, "commissionCap", 100);
    setSetting(f.db, "commissionPercent", 100);
    transaction(f.db, () => {
      f.db
        .prepare("UPDATE orders SET status='completed' WHERE id=?")
        .run(order.id);
      settleCommission(f.db, order.id);
    });
    transaction(f.db, () => settleCommission(f.db, order.id));
    assert.equal(
      f.db.prepare("SELECT balance FROM users WHERE id=?").get(f.other.id)
        .balance,
      50000,
    );
    assert.equal(
      f.db
        .prepare("SELECT COUNT(*) n FROM ledger WHERE kind='commission'")
        .get().n,
      1,
    );
  } finally {
    f.db.close();
  }
});

test("null means unlimited, zero disables payouts, discounts precede cap and cancelled bills never pay", () => {
  const f = fixture();
  try {
    f.db
      .prepare("UPDATE users SET referred_by=? WHERE id=?")
      .run(f.other.id, f.customer.id);
    setSetting(f.db, "commissionPercent", 5);
    f.db
      .prepare(
        "INSERT INTO promotions(id,code,type,value,starts_at,ends_at) VALUES(?,?,?,?,?,?)",
      )
      .run(
        id(),
        "CAPTEST",
        "fixed",
        1000,
        "2020-01-01T00:00:00.000Z",
        "2099-01-01T00:00:00.000Z",
      );
    for (const [cap, expected] of [
      [null, 450],
      [0, 0],
      [400, 400],
      [50000, 450],
    ]) {
      setSetting(f.db, "commissionCap", cap);
      const input = orderInput(f.product, {
        payment: "deposit",
        coupon: "CAPTEST",
      });
      input.expectedQuote = quote(f.db, f.customer.id, input).fingerprint;
      const order = createOrder(f.db, f.customer.id, input, id());
      assert.equal(order.commission_amount, expected);
      cancelOrder(f.db, f.customer.id, order.id);
      assert.equal(
        f.db.prepare("SELECT balance FROM users WHERE id=?").get(f.other.id)
          .balance,
        0,
      );
      if (expected)
        assert.equal(
          f.db
            .prepare("SELECT status FROM commissions WHERE order_id=?")
            .get(order.id).status,
          "void",
        );
    }
  } finally {
    f.db.close();
  }
});
