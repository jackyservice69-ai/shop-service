import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { mkdtempSync, rmSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  fixture,
  login,
  mutate,
  addUser,
  PASSWORD,
  slip,
  bank,
} from "./helpers.mjs";
import {
  id,
  openDb,
  now,
  bankTransferKey,
  verifyAudit,
} from "../server/db.mjs";
import { creditTopup } from "../server/commerce.mjs";
const body = (f, extra = {}) => ({
  userId: f.customer.id,
  amount: 12345,
  expectedBalance: 0,
  source: "cash",
  reference: "CASH-" + id(),
  reason: "รับเงินสดจากลูกค้า",
  actorPassword: PASSWORD,
  ...extra,
});
const topup = (c, v, key = id()) =>
  mutate(c, "/api/admin/wallet/topups", v, "post", key);
test("manual topup is owner-enabled by default; finance can read transactions but needs the explicit additional right, CSRF and origin", async () => {
  const f = fixture();
  try {
    const a = await login(f.app, f.admin),
      c = await login(f.app, f.customer),
      finance = await login(f.app, addUser(f.db, "accountant"));
    assert.equal(
      (await request(f.app).post("/api/admin/wallet/topups").send(body(f)))
        .status,
      401,
    );
    assert.equal(
      (await a.agent.post("/api/admin/wallet/topups").send(body(f))).status,
      403,
    );
    assert.equal(
      (
        await a.agent
          .post("/api/admin/wallet/topups")
          .set("x-csrf-token", a.csrf)
          .set("Origin", "https://evil.test")
          .send(body(f))
      ).status,
      403,
    );
    for (const user of [c, finance])
      assert.equal((await topup(user, body(f))).status, 403);
    assert.equal(
      (await finance.agent.get("/api/admin/wallet/transactions")).status,
      200,
    );
    assert.equal(
      (await finance.agent.get("/api/admin/wallet/customers?q=test")).status,
      403,
    );
    f.db
      .prepare("INSERT INTO roles VALUES(?,?,?)")
      .run("topup-only", "ไม่ครบสิทธิ์", '["wallet_topup"]');
    assert.equal(
      (await topup(await login(f.app, addUser(f.db, "topup-only")), body(f)))
        .status,
      403,
    );
    f.db
      .prepare("INSERT INTO roles VALUES(?,?,?)")
      .run("credit-staff", "ฝ่ายเติมเงิน", '["finance","wallet_topup"]');
    assert.equal(
      (await topup(await login(f.app, addUser(f.db, "credit-staff")), body(f)))
        .status,
      201,
    );
  } finally {
    f.db.close();
  }
});
test("manual credits are atomic satang, immutable, attributed and replay-safe; customers see only their own ledger without internal reasons", async () => {
  const f = fixture();
  try {
    const a = await login(f.app, f.admin),
      c = await login(f.app, f.customer),
      key = id(),
      v = body(f);
    const responses = await Promise.all([topup(a, v, key), topup(a, v, key)]);
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 201]);
    assert.equal(responses[0].body.id, responses[1].body.id);
    assert.equal(
      f.db.prepare("SELECT balance FROM users WHERE id=?").get(f.customer.id)
        .balance,
      12345,
    );
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM manual_topups").get().n,
      1,
    );
    assert.equal(
      f.db
        .prepare("SELECT COUNT(*) n FROM ledger WHERE kind='admin_topup'")
        .get().n,
      1,
    );
    assert.equal((await topup(a, { ...v, amount: 12346 }, key)).status, 409);
    assert.equal(
      (
        await topup(a, {
          ...v,
          expectedBalance: 12345,
          reference: v.reference.toLowerCase(),
        })
      ).status,
      409,
    );
    const ledger = f.db
      .prepare("SELECT * FROM ledger WHERE kind='admin_topup'")
      .get();
    const record = f.db.prepare("SELECT * FROM manual_topups").get();
    assert.equal(record.actor_id, f.admin.id);
    assert.equal(record.balance_before, 0);
    assert.equal(record.balance_after, 12345);
    assert.ok(!JSON.stringify(record).includes(PASSWORD));
    const own = (await c.agent.get("/api/wallet")).body;
    assert.ok(!JSON.stringify(own).includes(v.reason));
    assert.ok(JSON.stringify(own).includes(ledger.id));
    const visible = (
      await a.agent.get("/api/admin/wallet/transactions?kind=admin_topup")
    ).body;
    assert.equal(visible.items[0].actor_name, f.admin.name);
    assert.equal(visible.items[0].reason, v.reason);
    assert.equal(visible.items[0].balance_before, 0);
    for (const sql of [
      "UPDATE manual_topups SET amount=1",
      "DELETE FROM manual_topups",
    ])
      assert.throws(() => f.db.exec(sql), /immutable/);
    assert.ok(verifyAudit(f.db).valid);
    assert.ok(
      !JSON.stringify(f.db.prepare("SELECT details FROM audit").all()).includes(
        PASSWORD,
      ),
    );
  } finally {
    f.db.close();
  }
});
test("manual credits reject invalid amounts, target roles, inactive members, stale balances, unknown fields and incorrect operator passwords without changes", async () => {
  const f = fixture();
  try {
    const a = await login(f.app, f.admin);
    for (const patch of [
      { amount: 0 },
      { amount: -1 },
      { amount: 1.5 },
      { amount: 100000001 },
      { expectedBalance: 1 },
      { userId: f.admin.id },
      { source: "other" },
      { reference: "bad ref" },
      { source: "bank_transfer" },
      { balance: 99999 },
    ]) {
      const r = await topup(a, body(f, patch));
      assert.ok([400, 409].includes(r.status), JSON.stringify(patch));
    }
    const freshOwner = await login(f.app, addUser(f.db, "admin"));
    assert.equal(
      (await topup(freshOwner, body(f, { actorPassword: "wrong" }))).status,
      400,
    );
    f.db.prepare("UPDATE users SET active=0 WHERE id=?").run(f.customer.id);
    assert.equal((await topup(freshOwner, body(f))).status, 409);
    assert.equal(
      (await topup(freshOwner, body(f, { userId: id() }))).status,
      404,
    );
    assert.equal(f.db.prepare("SELECT SUM(balance) n FROM users").get().n, 0);
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM manual_topups").get().n,
      0,
    );
  } finally {
    f.db.close();
  }
});
test("slip and manual transfer topups share one transaction registry, including across customers and letter case", async () => {
  const f = fixture();
  try {
    const a = await login(f.app, f.admin),
      ref = id();
    assert.equal(
      (
        await topup(
          a,
          body(f, {
            source: "bank_transfer",
            senderBankCode: "004",
            reference: ref,
            amount: 10000,
          }),
        )
      ).status,
      201,
    );
    assert.throws(
      () =>
        creditTopup(
          f.db,
          f.other.id,
          id(),
          id(),
          10000,
          slip(100, {
            rawSlip: { ...slip(100).rawSlip, transRef: ref.toUpperCase() },
          }),
          bank,
        ),
      /ถูกเติมเงินแล้ว/,
    );
    const otherRef = id();
    creditTopup(
      f.db,
      f.other.id,
      id(),
      id(),
      10000,
      slip(100, { rawSlip: { ...slip(100).rawSlip, transRef: otherRef } }),
      bank,
    );
    assert.equal(
      (
        await topup(
          a,
          body(f, {
            source: "bank_transfer",
            senderBankCode: "004",
            reference: otherRef.toUpperCase(),
            expectedBalance: 10000,
          }),
        )
      ).status,
      409,
    );
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM funding_receipts").get().n,
      2,
    );
    assert.equal(
      f.db.prepare("SELECT balance FROM users WHERE id=?").get(f.customer.id)
        .balance,
      10000,
    );
    assert.equal(
      f.db.prepare("SELECT balance FROM users WHERE id=?").get(f.other.id)
        .balance,
      10000,
    );
    assert.throws(() => f.db.exec("DELETE FROM funding_receipts"), /immutable/);
  } finally {
    f.db.close();
  }
});
test("failed financial writes roll back wallet, receipt, manual record and audit together", async () => {
  const f = fixture();
  try {
    const a = await login(f.app, f.admin),
      before = f.db.prepare("SELECT COUNT(*) n FROM audit").get().n;
    f.db.exec(
      "CREATE TRIGGER simulate_failed_credit BEFORE INSERT ON manual_topups BEGIN SELECT RAISE(ABORT,'simulated failure'); END;",
    );
    assert.equal(
      (
        await topup(
          a,
          body(f, { source: "bank_transfer", senderBankCode: "004" }),
        )
      ).status,
      500,
    );
    assert.equal(f.db.prepare("SELECT SUM(balance) n FROM users").get().n, 0);
    for (const table of ["ledger", "manual_topups", "funding_receipts"])
      assert.equal(f.db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n, 0);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM audit").get().n, before);
  } finally {
    f.db.close();
  }
});
test("transaction history is filtered/paginated, customer search excludes staff and inactive users, and dashboard treats credits as liability rather than sales", async () => {
  const f = fixture();
  try {
    const a = await login(f.app, f.admin);
    const search = await a.agent.get(
      "/api/admin/wallet/customers?q=" + encodeURIComponent(f.customer.email),
    );
    assert.equal(search.body.items[0].id, f.customer.id);
    assert.deepEqual(
      (
        await a.agent.get(
          "/api/admin/wallet/customers?q=" + encodeURIComponent(f.admin.email),
        )
      ).body.items,
      [],
    );
    assert.deepEqual(
      (await a.agent.get("/api/admin/wallet/customers?q=a")).body.items,
      [],
    );
    for (let i = 0; i < 3; i++)
      assert.equal(
        (
          await topup(
            a,
            body(f, {
              amount: 100,
              expectedBalance: i * 100,
              reference: "PAGE-" + i,
            }),
          )
        ).status,
        201,
      );
    const rows = (
      await a.agent.get(
        "/api/admin/wallet/transactions?kind=admin_topup&size=2&page=2&q=PAGE",
      )
    ).body;
    assert.equal(rows.total, 3);
    assert.equal(rows.items.length, 1);
    assert.equal(
      (await a.agent.get("/api/admin/wallet/transactions?kind=unknown")).status,
      400,
    );
    const dashboard = (await a.agent.get("/api/admin/dashboard")).body;
    assert.equal(dashboard.topups, 300);
    assert.equal(dashboard.walletLiability, 300);
    assert.equal(dashboard.received, 0);
    assert.equal(dashboard.sales, 0);
  } finally {
    f.db.close();
  }
});
test("manual-topup reauthentication failures are throttled, while revoking the role blocks further credits", async () => {
  const f = fixture();
  try {
    const a = await login(f.app, f.admin);
    for (let i = 0; i < 10; i++)
      assert.equal(
        (await topup(a, body(f, { actorPassword: "wrong" }))).status,
        400,
      );
    assert.equal((await topup(a, body(f))).status, 429);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM ledger").get().n, 0);
    f.db
      .prepare("INSERT INTO roles VALUES(?,?,?)")
      .run("revoked-credit", "ทีมเติมเงิน", '["finance","wallet_topup"]');
    const s = await login(f.app, addUser(f.db, "revoked-credit"));
    assert.equal((await topup(s, body(f))).status, 201);
    assert.equal(
      (
        await mutate(
          a,
          "/api/admin/roles/revoked-credit",
          { name: "ทีมดูธุรกรรม", permissions: ["finance"] },
          "put",
        )
      ).status,
      200,
    );
    assert.equal(
      (await topup(s, body(f, { expectedBalance: 12345 }))).status,
      401,
    );
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM ledger").get().n, 1);
  } finally {
    f.db.close();
  }
});
test("v9 migration backfills receipt deduplication and preserves financial history without granting staff topup rights", () => {
  const dir = mkdtempSync(join(tmpdir(), "hiewly-funding-")),
    path = join(dir, "legacy.sqlite");
  let db;
  try {
    db = openDb(path);
    const user = addUser(db);
    const tid = id(),
      ref = "004:legacy-bank-reference";
    db.prepare("INSERT INTO topups VALUES(?,?,?,?,?,?,?)").run(
      tid,
      user.id,
      id(),
      id(),
      ref,
      10000,
      now(),
    );
    db.exec("PRAGMA user_version=8");
    db.close();
    db = null;
    let count;
    for (let i = 0; i < 2; i++) {
      db = openDb(path);
      const receipt = db
        .prepare("SELECT * FROM funding_receipts WHERE bank_ref=?")
        .get(bankTransferKey(ref));
      assert.equal(receipt.reference, tid);
      assert.equal(db.prepare("SELECT COUNT(*) n FROM topups").get().n, 1);
      assert.equal(
        db.prepare("SELECT COUNT(*) n FROM manual_topups").get().n,
        0,
      );
      assert.equal(db.prepare("PRAGMA user_version").get().user_version, 9);
      assert.ok(
        db
          .prepare("SELECT permissions FROM roles WHERE id!='admin'")
          .all()
          .every((r) => !JSON.parse(r.permissions).includes("wallet_topup")),
      );
      const n = db.prepare("SELECT COUNT(*) n FROM audit").get().n;
      if (i) assert.equal(n, count);
      count = n;
      db.close();
      db = null;
    }
  } finally {
    db?.close();
    for (const suffix of ["", "-wal", "-shm"])
      rmSync(path + suffix, { force: true });
    rmdirSync(dir);
  }
});
