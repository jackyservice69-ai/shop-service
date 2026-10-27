import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { mkdtempSync, rmSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixture, login, mutate, addUser, addProduct } from "./helpers.mjs";
import { id, now, openDb, verifyAudit } from "../server/db.mjs";

const feed = async (c) => {
  const r = await c.agent.get("/api/notifications");
  assert.equal(r.status, 200);
  return r.body;
};
const apply = (c, shopName = "ร้านตัวแทนทดสอบ") =>
  mutate(c, "/api/consignment/apply", { shopName, acceptTerms: true });
const approve = (a, uid, version = 1, status = "approved") =>
  mutate(
    a,
    "/api/admin/consignments/" + uid,
    { status, version, note: "" },
    "put",
  );

test("notification requests and decisions are private, permission-scoped and independently read", async () => {
  const f = fixture();
  try {
    f.db
      .prepare("INSERT INTO roles VALUES(?,?,?)")
      .run("notification-staff", "ผู้อนุมัติ", '["consignments"]');
    const staff = await login(f.app, addUser(f.db, "notification-staff"));
    const a = await login(f.app, f.admin),
      c = await login(f.app, f.customer),
      other = await login(f.app, f.other);
    assert.equal((await request(f.app).get("/api/notifications")).status, 401);
    assert.equal((await apply(c)).status, 201);
    assert.equal((await apply(c)).status, 409);
    const mine = await feed(c),
      admin = await feed(a);
    assert.equal(mine.items.length, 1);
    assert.equal(mine.items[0].kind, "submitted");
    assert.equal(admin.items.length, 1);
    assert.equal(admin.items[0].kind, "request");
    assert.equal((await feed(other)).items.length, 0);
    assert.equal(
      (await mutate(other, `/api/notifications/${mine.items[0].id}/read`))
        .status,
      404,
    );
    assert.equal(
      (
        await mutate(other, "/api/notifications/read-all", {
          through: admin.snapshot,
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await c.agent
          .post(`/api/notifications/${mine.items[0].id}/read`)
          .send({})
      ).status,
      403,
    );
    assert.equal(
      (
        await c.agent
          .post(`/api/notifications/${mine.items[0].id}/read`)
          .set("x-csrf-token", c.csrf)
          .set("Origin", "https://evil.test")
          .send({})
      ).status,
      403,
    );
    assert.equal(
      (await mutate(staff, `/api/notifications/${admin.items[0].id}/read`))
        .status,
      200,
    );
    assert.equal((await feed(staff)).unreadCount, 0);
    assert.equal((await feed(a)).unreadCount, 1);
    assert.equal(
      (await mutate(staff, `/api/notifications/${admin.items[0].id}/read`))
        .status,
      200,
    );
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM notification_reads").get().n,
      1,
    );
    f.db
      .prepare(
        "UPDATE roles SET permissions='[]' WHERE id='notification-staff'",
      )
      .run();
    assert.equal((await feed(staff)).items.length, 0);
    assert.equal(
      (await mutate(staff, `/api/notifications/${admin.items[0].id}/read`))
        .status,
      404,
    );
    assert.equal((await approve(a, f.customer.id)).status, 200);
    const outcome = await feed(c);
    assert.equal(outcome.items[0].kind, "approved");
    assert.equal(outcome.items[0].href, "/consignment");
    assert.equal((await feed(a)).items.length, 0);
    const count = f.db.prepare("SELECT COUNT(*) n FROM notifications").get().n;
    assert.equal((await approve(a, f.customer.id)).status, 409);
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM notifications").get().n,
      count,
    );
    assert.equal((await feed(other)).unreadCount, 0);
    assert.ok(
      outcome.items.every((n) => !("recipient_id" in n) && !("event_key" in n)),
    );
  } finally {
    f.db.close();
  }
});

test("product submit, edit, reject, approve and generic admin moderation create atomic notifications without duplicate decisions", async () => {
  const f = fixture();
  try {
    const a = await login(f.app, f.admin),
      c = await login(f.app, f.customer);
    await apply(c);
    await approve(a, f.customer.id);
    const mid = id();
    f.db
      .prepare("INSERT INTO media VALUES(?,?,?,?,?,?,?,?,?)")
      .run(
        mid,
        "product",
        "image/png",
        20,
        20,
        1,
        Buffer.from([0]),
        f.customer.id,
        now(),
      );
    const input = {
      name: "สินค้ารออนุมัติ",
      description: "รายละเอียดสินค้า",
      category: "กระเป๋า",
      price: 10000,
      stock: 2,
      image: "/api/media/" + mid,
    };
    assert.equal(
      (await mutate(c, "/api/consignment/products", input)).status,
      201,
    );
    const p = f.db
      .prepare("SELECT * FROM products WHERE consignor_id=?")
      .get(f.customer.id);
    assert.equal(
      (await feed(a)).items[0].href,
      "/admin/consignments?tab=products",
    );
    assert.equal(
      (
        await mutate(
          c,
          "/api/consignment/products/" + p.id,
          { ...input, version: 1 },
          "put",
        )
      ).status,
      200,
    );
    assert.equal((await feed(a)).items.length, 1);
    assert.equal(
      (
        await mutate(
          a,
          "/api/admin/consignment-products/" + p.id,
          { approved: false, version: 2 },
          "put",
        )
      ).status,
      200,
    );
    assert.equal((await feed(a)).unreadCount, 0);
    assert.equal((await feed(c)).items[0].kind, "rejected");
    assert.equal(
      (
        await mutate(
          c,
          "/api/consignment/products/" + p.id,
          { ...input, version: 3 },
          "put",
        )
      ).status,
      200,
    );
    const edit = {
      ...input,
      images: [input.image],
      cost: 0,
      active: true,
      version: 4,
    };
    assert.equal(
      (await mutate(a, "/api/admin/products/" + p.id, edit, "put")).status,
      200,
    );
    assert.equal((await feed(c)).items[0].kind, "approved");
    assert.equal((await feed(a)).items.length, 0);
    const count = f.db.prepare("SELECT COUNT(*) n FROM notifications").get().n;
    assert.equal(
      (
        await mutate(
          a,
          "/api/admin/products/" + p.id,
          { ...edit, version: 5 },
          "put",
        )
      ).status,
      200,
    );
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM notifications").get().n,
      count,
    );
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM ledger").get().n, 0);
    assert.equal(verifyAudit(f.db).valid, true);
  } finally {
    f.db.close();
  }
});

test("cursor paging and read-all preserve newer arrivals and reject invalid or foreign anchors", async () => {
  const f = fixture();
  try {
    const a = await login(f.app, f.admin),
      c = await login(f.app, f.customer);
    await apply(c);
    const first = await feed(c);
    await approve(a, f.customer.id);
    const read = await mutate(c, "/api/notifications/read-all", {
      through: first.snapshot,
    });
    assert.equal(read.status, 200);
    assert.equal(read.body.unreadCount, 1);
    const page = await c.agent.get("/api/notifications?size=1");
    assert.equal(page.body.items.length, 1);
    assert.ok(page.body.nextCursor);
    const older = await c.agent.get(
      "/api/notifications?size=1&before=" + page.body.nextCursor,
    );
    assert.equal(older.body.items[0].id, first.snapshot);
    assert.ok(older.body.items[0].read_at);
    assert.equal(older.body.nextCursor, null);
    for (const url of [
      "?size=0",
      "?size=51",
      "?before=-1",
      "?before=abc",
      "?user_id=other",
    ])
      assert.equal((await c.agent.get("/api/notifications" + url)).status, 400);
    for (const body of [
      { through: 0 },
      { through: -1 },
      { through: first.snapshot, user_id: f.other.id },
    ])
      assert.equal(
        (await mutate(c, "/api/notifications/read-all", body)).status,
        400,
      );
    assert.equal(
      (
        await mutate(c, `/api/notifications/${first.snapshot}/read`, {
          read_at: now(),
        })
      ).status,
      400,
    );
    f.db.prepare("UPDATE users SET active=0 WHERE id=?").run(f.customer.id);
    assert.equal((await c.agent.get("/api/notifications")).status, 401);
  } finally {
    f.db.close();
  }
});

test("notification insertion and read audit failures roll back the associated action and read marker", async () => {
  const f = fixture();
  try {
    const c = await login(f.app, f.customer);
    f.db.exec(
      "CREATE TRIGGER fail_notice BEFORE INSERT ON notifications BEGIN SELECT RAISE(ABORT,'test failure'); END;",
    );
    const auditBefore = f.db.prepare("SELECT COUNT(*) n FROM audit").get().n;
    assert.equal((await apply(c)).status, 500);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM consignors").get().n, 0);
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM audit").get().n,
      auditBefore,
    );
    f.db.exec("DROP TRIGGER fail_notice;");
    await apply(c);
    const n = (await feed(c)).items[0];
    f.db.exec(
      "CREATE TRIGGER fail_notice_audit BEFORE INSERT ON audit WHEN NEW.action='notifications.read' BEGIN SELECT RAISE(ABORT,'test failure'); END;",
    );
    assert.equal(
      (await mutate(c, `/api/notifications/${n.id}/read`)).status,
      500,
    );
    assert.equal((await feed(c)).unreadCount, 1);
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM notification_reads").get().n,
      0,
    );
  } finally {
    f.db.close();
  }
});

test("v11 upgrade backfills pending approval requests once and retains data and read markers on reopen", () => {
  const folder = mkdtempSync(join(tmpdir(), "iya-notifications-")),
    path = join(folder, "isolated.sqlite");
  let db;
  try {
    db = openDb(path);
    const member = addUser(db),
      seller = addUser(db),
      product = addProduct(db);
    for (const [u, status] of [
      [member, "pending"],
      [seller, "approved"],
    ])
      db.prepare(
        "INSERT INTO consignors(user_id,shop_name,status,created_at,updated_at) VALUES(?,?,?,?,?)",
      ).run(u.id, "ร้านทดสอบ", status, now(), now());
    db.prepare(
      "UPDATE products SET consignor_id=?,consignment_status='pending',active=0 WHERE id=?",
    ).run(seller.id, product.id);
    db.exec(
      "DELETE FROM notification_reads;DELETE FROM notifications;PRAGMA user_version=10;",
    );
    db.close();
    db = openDb(path);
    assert.equal(db.prepare("PRAGMA user_version").get().user_version, 17);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM notifications").get().n, 2);
    const n = db.prepare("SELECT id FROM notifications LIMIT 1").get();
    db.prepare("INSERT INTO notification_reads VALUES(?,?,?)").run(
      n.id,
      seller.id,
      now(),
    );
    assert.equal(db.prepare("SELECT COUNT(*) n FROM ledger").get().n, 0);
    db.close();
    db = openDb(path);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM notifications").get().n, 2);
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM notification_reads").get().n,
      1,
    );
    assert.equal(
      db.prepare("SELECT status FROM consignors WHERE user_id=?").get(member.id)
        .status,
      "pending",
    );
  } finally {
    db?.close();
    for (const suffix of ["", "-wal", "-shm"])
      rmSync(path + suffix, { force: true });
    rmdirSync(folder);
  }
});
