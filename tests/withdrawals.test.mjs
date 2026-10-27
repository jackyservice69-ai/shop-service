import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { mkdtempSync, rmSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixture, login, mutate, addUser } from "./helpers.mjs";
import { wallet, id, now, openDb, verifyAudit } from "../server/db.mjs";
import { consignmentFunds } from "../server/withdrawal-funds.mjs";
import { notifyMembershipRequest } from "../server/notifications.mjs";
import { backupBeforeMigration } from "../server/pre-migration-backup.mjs";
import { DatabaseSync } from "node:sqlite";

const destination = {
  bankCode: "014",
  bankNumber: "1234567890",
  accountName: "ตัวแทน ทดสอบ",
};
const input = (amount = 6000) => ({ ...destination, amount });
function membership(db, u, status = "approved") {
  db.prepare(
    "INSERT INTO consignors(user_id,shop_name,status,created_at,updated_at) VALUES(?,?,?,?,?)",
  ).run(u.id, "ร้านตัวแทน", status, now(), now());
}
function staff(f, role, permissions) {
  f.db
    .prepare("INSERT INTO roles VALUES(?,?,?)")
    .run(role, role, JSON.stringify(permissions));
  return addUser(f.db, role);
}
const balance = (f, u) =>
  f.db.prepare("SELECT balance FROM users WHERE id=?").get(u.id).balance;
async function submit(f, c, amount = 6000, key = id()) {
  return mutate(c, "/api/consignment/withdrawals", input(amount), "post", key);
}
async function act(c, w, action, extra = {}) {
  return mutate(c, `/api/admin/withdrawals/${w.id}/${action}`, {
    version: w.version,
    ...extra,
  });
}
function funds(f, amount = 10000) {
  wallet(f.db, f.customer.id, amount, "consignment", id());
}

test("withdrawable attribution excludes topups/commissions and restores only consignment-funded purchases on refund", () => {
  const f = fixture();
  try {
    const uid = f.customer.id,
      order = id();
    wallet(f.db, uid, 10000, "consignment", id());
    wallet(f.db, uid, 20000, "topup", id());
    wallet(f.db, uid, 5000, "commission", id());
    assert.equal(consignmentFunds(f.db, uid), 10000);
    wallet(f.db, uid, -30000, "purchase", order);
    assert.equal(consignmentFunds(f.db, uid), 5000);
    wallet(f.db, uid, 30000, "refund", order);
    assert.equal(consignmentFunds(f.db, uid), 10000);
    const order2 = id();
    wallet(f.db, uid, -32000, "purchase", order2);
    wallet(f.db, uid, -3000, "settlement", order2);
    assert.equal(consignmentFunds(f.db, uid), 0);
    wallet(f.db, uid, 10000, "topup", id());
    assert.equal(
      consignmentFunds(f.db, uid),
      0,
      "topup must not revive spent earnings",
    );
    wallet(f.db, uid, 35000, "refund", order2);
    assert.equal(consignmentFunds(f.db, uid), 10000);
  } finally {
    f.db.close();
  }
});

test("only approved sellers can request; posted amounts, bank details, CSRF and balances are validated", async () => {
  const f = fixture();
  try {
    const c = await login(f.app, f.customer);
    wallet(f.db, f.customer.id, 50000, "topup", id());
    assert.equal((await submit(f, c)).status, 403);
    membership(f.db, f.customer, "pending");
    assert.equal((await submit(f, c)).status, 403);
    f.db.prepare("UPDATE consignors SET status='approved'").run();
    assert.equal(
      (await submit(f, c)).status,
      409,
      "topups are not withdrawable earnings",
    );
    funds(f);
    for (const v of [
      { amount: 0 },
      { amount: -1 },
      { amount: 100.5 },
      { bankNumber: "1" },
      { bankCode: "999" },
      { accountName: "" },
      { status: "paid" },
    ]) {
      assert.equal(
        (
          await mutate(
            c,
            "/api/consignment/withdrawals",
            { ...input(), ...v },
            "post",
            id(),
          )
        ).status,
        400,
      );
    }
    assert.equal(
      (
        await c.agent
          .post("/api/consignment/withdrawals")
          .set("Idempotency-Key", id())
          .send(input())
      ).status,
      403,
    );
    assert.equal(
      (await request(f.app).get("/api/consignment/withdrawals")).status,
      401,
    );
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM withdrawals").get().n, 0);
  } finally {
    f.db.close();
  }
});

test("request reserves once, retry stays idempotent, competing requests and spending cannot consume held funds", async () => {
  const f = fixture();
  try {
    membership(f.db, f.customer);
    funds(f);
    const c = await login(f.app, f.customer),
      key = id(),
      a = await submit(f, c, 6000, key);
    assert.equal(a.status, 201);
    assert.equal(balance(f, f.customer), 4000);
    const retry = await submit(f, c, 6000, key);
    assert.equal(retry.status, 200);
    assert.equal(retry.body.id, a.body.id);
    assert.equal((await submit(f, c, 7000, key)).status, 409);
    assert.equal((await submit(f, c, 6000)).status, 409);
    assert.throws(
      () => wallet(f.db, f.customer.id, -5000, "purchase", id()),
      /ยอดเงินไม่เพียงพอ/,
    );
    const races = await Promise.all([submit(f, c, 4000), submit(f, c, 4000)]);
    assert.deepEqual(races.map((r) => r.status).sort(), [201, 409]);
    assert.equal(balance(f, f.customer), 0);
    const list = await c.agent.get("/api/consignment/withdrawals");
    assert.equal(list.body.available, 0);
    assert.equal(list.body.held, 10000);
    assert.equal(
      f.db
        .prepare("SELECT COUNT(*) n FROM ledger WHERE kind='withdrawal_hold'")
        .get().n,
      2,
    );
    assert.equal(verifyAudit(f.db).valid, true);
  } finally {
    f.db.close();
  }
});

test("cancellation and rejection release the exact held earnings once, including after approval", async () => {
  const f = fixture();
  try {
    membership(f.db, f.customer);
    funds(f);
    const c = await login(f.app, f.customer),
      a = await login(f.app, f.admin),
      other = await login(f.app, f.other);
    let w = (await submit(f, c)).body;
    assert.equal(
      (
        await mutate(other, `/api/consignment/withdrawals/${w.id}/cancel`, {
          version: 1,
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await mutate(c, `/api/consignment/withdrawals/${w.id}/cancel`, {
          version: 1,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await mutate(c, `/api/consignment/withdrawals/${w.id}/cancel`, {
          version: 1,
        })
      ).status,
      409,
    );
    assert.equal(balance(f, f.customer), 10000);
    assert.equal(consignmentFunds(f.db, f.customer.id), 10000);
    w = (await submit(f, c)).body;
    assert.equal((await act(a, w, "approve")).status, 200);
    assert.equal(
      (
        await mutate(c, `/api/consignment/withdrawals/${w.id}/cancel`, {
          version: 2,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await act(a, { ...w, version: 2 }, "reject", {
          note: "ข้อมูลบัญชีไม่ถูกต้อง",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await act(a, { ...w, version: 2 }, "reject", {
          note: "ข้อมูลบัญชีไม่ถูกต้อง",
        })
      ).status,
      409,
    );
    assert.equal(balance(f, f.customer), 10000);
    assert.equal(consignmentFunds(f.db, f.customer.id), 10000);
    assert.equal(
      f.db
        .prepare(
          "SELECT COUNT(*) n FROM ledger WHERE kind='withdrawal_release'",
        )
        .get().n,
      2,
    );
  } finally {
    f.db.close();
  }
});

test("view/approve/pay grants are separate, no self approval, notices follow current role and recipient", async () => {
  const f = fixture({ authRateLimit: 100 });
  try {
    membership(f.db, f.customer);
    funds(f);
    const c = await login(f.app, f.customer),
      admin = await login(f.app, f.admin),
      view = await login(
        f.app,
        staff(f, "withdraw-view", ["finance", "withdrawals"]),
      ),
      approve = await login(
        f.app,
        staff(f, "withdraw-approve", [
          "finance",
          "withdrawals",
          "withdrawals_approve",
        ]),
      ),
      pay = await login(
        f.app,
        staff(f, "withdraw-pay", ["finance", "withdrawals", "withdrawals_pay"]),
      ),
      manager = await login(f.app, addUser(f.db, "manager")),
      other = await login(f.app, f.other);
    const w = (await submit(f, c)).body;
    for (const client of [c, manager, other])
      assert.equal(
        (await client.agent.get("/api/admin/withdrawals")).status,
        403,
      );
    assert.equal((await view.agent.get("/api/admin/withdrawals")).status, 200);
    assert.equal((await act(view, w, "approve")).status, 403);
    assert.equal((await act(pay, w, "approve")).status, 403);
    assert.equal(
      (await act(pay, w, "pay", { transferReference: "TEST-001" })).status,
      409,
    );
    assert.equal(
      (await approve.agent.get("/api/notifications")).body.items.length,
      1,
    );
    for (const client of [view, pay, manager, other])
      assert.equal(
        (await client.agent.get("/api/notifications")).body.items.length,
        0,
      );
    assert.equal((await act(approve, w, "approve")).status, 200);
    assert.equal(balance(f, f.customer), 4000, "approval does not debit again");
    assert.equal(
      (await approve.agent.get("/api/notifications")).body.items.length,
      0,
    );
    assert.equal(
      (await pay.agent.get("/api/notifications")).body.items.length,
      1,
    );
    assert.equal(
      (
        await act(approve, { ...w, version: 2 }, "pay", {
          transferReference: "TEST-001",
        })
      ).status,
      403,
    );
    assert.equal((await act(pay, { ...w, version: 2 }, "claim")).status, 200);
    assert.equal(
      (
        await act(pay, { ...w, version: 3 }, "pay", {
          transferReference: "TEST-001",
        })
      ).status,
      200,
    );
    assert.equal(
      (await pay.agent.get("/api/notifications")).body.items.length,
      0,
    );
    assert.equal(
      (await c.agent.get("/api/notifications")).body.items.length,
      4,
    );
    assert.equal(
      (
        await act(admin, { ...w, version: 3 }, "reject", {
          note: "หลังโอนแล้ว",
        })
      ).status,
      409,
    );
    f.db
      .prepare("UPDATE users SET role_id='admin' WHERE id=?")
      .run(f.customer.id);
    const self = (await submit(f, c, 1000)).body;
    assert.equal((await act(c, self, "approve")).status, 403);
    f.db
      .prepare("UPDATE roles SET permissions='[]' WHERE id='withdraw-approve'")
      .run();
    assert.equal((await act(approve, self, "approve")).status, 403);
  } finally {
    f.db.close();
  }
});

test("payment requires approval, unique reference, current version and active seller; retry never double pays", async () => {
  const f = fixture();
  try {
    membership(f.db, f.customer);
    funds(f, 30000);
    const c = await login(f.app, f.customer),
      a = await login(f.app, f.admin);
    const w = (await submit(f, c)).body;
    assert.equal(
      (await act(a, w, "pay", { transferReference: "PAY-100" })).status,
      409,
    );
    assert.equal((await act(a, w, "approve")).status, 200);
    assert.equal((await act(a, w, "approve")).status, 409);
    assert.equal((await act(a, { ...w, version: 2 }, "claim")).status, 200);
    assert.equal((await act(a, { ...w, version: 2 }, "pay")).status, 400);
    f.db.prepare("UPDATE users SET active=0 WHERE id=?").run(f.customer.id);
    assert.equal(
      (
        await act(a, { ...w, version: 3 }, "pay", {
          transferReference: "PAY-100",
        })
      ).status,
      403,
    );
    f.db.prepare("UPDATE users SET active=1 WHERE id=?").run(f.customer.id);
    assert.equal(
      (
        await act(a, { ...w, version: 3 }, "pay", {
          transferReference: "pay-100",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await act(a, { ...w, version: 3 }, "pay", {
          transferReference: "pay-100",
        })
      ).status,
      409,
    );
    const w2 = (await submit(f, c)).body;
    await act(a, w2, "approve");
    assert.equal((await act(a, { ...w2, version: 2 }, "claim")).status, 200);
    assert.equal(
      (
        await act(a, { ...w2, version: 3 }, "pay", {
          transferReference: "PAY-100",
        })
      ).status,
      409,
    );
    assert.equal(balance(f, f.customer), 18000);
    assert.equal(consignmentFunds(f.db, f.customer.id), 18000);
    assert.equal(
      f.db
        .prepare("SELECT COUNT(*) n FROM withdrawals WHERE status='paid'")
        .get().n,
      1,
    );
    assert.equal(verifyAudit(f.db).valid, true);
  } finally {
    f.db.close();
  }
});

test("exclusive processing claims prevent two payout operators; only the claimant records payment and owner can recover an untransferred queue", async () => {
  const f = fixture();
  try {
    membership(f.db, f.customer);
    funds(f);
    const c = await login(f.app, f.customer),
      admin = await login(f.app, f.admin),
      p1 = await login(
        f.app,
        staff(f, "payer-one", ["finance", "withdrawals", "withdrawals_pay"]),
      ),
      p2 = await login(
        f.app,
        staff(f, "payer-two", ["finance", "withdrawals", "withdrawals_pay"]),
      );
    const w = (await submit(f, c)).body;
    await act(admin, w, "approve");
    const results = await Promise.all([
      act(p1, { ...w, version: 2 }, "claim"),
      act(p2, { ...w, version: 2 }, "claim"),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    const loser = results[0].status === 200 ? p2 : p1;
    assert.equal(
      (
        await act(loser, { ...w, version: 3 }, "pay", {
          transferReference: "LOCK-001",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await act(loser, { ...w, version: 3 }, "release", {
          note: "ยังไม่ได้โอนเงิน",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await act(admin, { ...w, version: 3 }, "reject", {
          note: "ไม่อนุมัติขณะโอน",
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await act(admin, { ...w, version: 3 }, "release", {
          note: "ตรวจสอบธนาคารแล้ว ยังไม่ได้โอน",
        })
      ).status,
      200,
    );
    assert.equal(
      balance(f, f.customer),
      4000,
      "returning to queue does not return held money",
    );
    assert.equal(
      (await c.agent.get("/api/consignment/withdrawals")).body.held,
      6000,
    );
    assert.equal((await act(p2, { ...w, version: 4 }, "claim")).status, 200);
    assert.equal(
      (
        await act(p2, { ...w, version: 5 }, "pay", {
          transferReference: "LOCK-001",
        })
      ).status,
      200,
    );
    assert.equal(verifyAudit(f.db).valid, true);
    assert.throws(() =>
      f.db.prepare("UPDATE withdrawals SET amount=1 WHERE id=?").run(w.id),
    );
    assert.throws(() =>
      f.db.prepare("DELETE FROM withdrawals WHERE id=?").run(w.id),
    );
  } finally {
    f.db.close();
  }
});

test("failed request audit rolls back the request, hold and notifications together", async () => {
  const f = fixture();
  try {
    membership(f.db, f.customer);
    funds(f);
    const c = await login(f.app, f.customer);
    f.db.exec(
      "CREATE TRIGGER fail_withdrawal_audit BEFORE INSERT ON audit WHEN NEW.action='withdrawal.requested' BEGIN SELECT RAISE(ABORT,'test failure'); END;",
    );
    assert.equal((await submit(f, c)).status, 500);
    assert.equal(balance(f, f.customer), 10000);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM withdrawals").get().n, 0);
    assert.equal(
      f.db
        .prepare("SELECT COUNT(*) n FROM ledger WHERE kind='withdrawal_hold'")
        .get().n,
      0,
    );
    assert.equal(
      f.db
        .prepare(
          "SELECT COUNT(*) n FROM notifications WHERE topic='consignment.withdrawal'",
        )
        .get().n,
      0,
    );
  } finally {
    f.db.close();
  }
});

test("v15 migration preserves notification reads, wallets and audit, with verified backup and repeatable reopen", async () => {
  const folder = mkdtempSync(join(tmpdir(), "iya-withdrawals-")),
    file = join(folder, "fixture.sqlite");
  let db;
  let snapshot;
  try {
    db = openDb(file);
    const u = addUser(db);
    wallet(db, u.id, 12345, "consignment", id());
    notifyMembershipRequest(db, u.id, "ร้านทดสอบ");
    const n = db.prepare("SELECT id FROM notifications LIMIT 1").get().id;
    db.prepare("INSERT INTO notification_reads VALUES(?,?,?)").run(
      n,
      u.id,
      now(),
    );
    const before = db.prepare("SELECT COUNT(*) n FROM ledger").get().n;
    db.exec("DROP TABLE withdrawals;PRAGMA user_version=15;");
    db.close();
    db = null;
    snapshot = await backupBeforeMigration(file);
    const old = new DatabaseSync(snapshot, { readOnly: true });
    assert.equal(old.prepare("PRAGMA user_version").get().user_version, 15);
    old.close();
    db = openDb(file);
    assert.equal(db.prepare("PRAGMA user_version").get().user_version, 17);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM ledger").get().n, before);
    assert.equal(
      db.prepare("SELECT balance FROM users WHERE id=?").get(u.id).balance,
      12345,
    );
    assert.equal(
      db
        .prepare(
          "SELECT COUNT(*) n FROM notification_reads WHERE notification_id=?",
        )
        .get(n).n,
      1,
    );
    assert.equal(verifyAudit(db).valid, true);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    db.close();
    db = openDb(file);
    assert.equal(consignmentFunds(db, u.id), 12345);
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM notification_reads").get().n,
      1,
    );
  } finally {
    db?.close();
    if (snapshot) rmSync(snapshot, { force: true });
    if (snapshot) rmdirSync(join(folder, "backups"));
    for (const suffix of ["", "-wal", "-shm"])
      rmSync(file + suffix, { force: true });
    rmdirSync(folder);
  }
});
