import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { fixture, login, PASSWORD, addUser } from "./helpers.mjs";
import { openDb } from "../server/db.mjs";
import { mkdtempSync, rmSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const profile = {
  firstName: "  กานต์  ",
  lastName: " ตัวอย่าง ",
  phone: "+66 (81) 234-5678",
  discoverySource: " TikTok ",
  lineId: " @shop.member ",
  email: "profile@example.test",
  password: PASSWORD,
};

test("production request throttling cannot be raised by a test-only override", async () => {
  const f = fixture({ production: true, apiRateLimit: 3000 });
  try {
    for (let i = 0; i < 300; i++)
      assert.equal((await request(f.app).get("/api/health")).status, 200);
    assert.equal((await request(f.app).get("/api/health")).status, 429);
  } finally {
    f.db.close();
  }
});

test("registration stores split names and normalized contact data; only owner and member staff can read it", async () => {
  const f = fixture();
  try {
    const agent = request.agent(f.app);
    const r = await agent.post("/api/auth/register").send({
      ...profile,
      referralCode: f.customer.referral_code,
      name: "forged",
      role_id: "admin",
    });
    assert.equal(r.status, 200);
    const u = r.body.user;
    assert.equal(u.firstName, "กานต์");
    assert.equal(u.lastName, "ตัวอย่าง");
    assert.equal(u.name, "กานต์ ตัวอย่าง");
    assert.equal(u.phone, "+66812345678");
    assert.equal(u.discoverySource, "TikTok");
    assert.equal(u.lineId, "@shop.member");
    assert.equal(u.roleId, "customer");
    const me = (await agent.get("/api/me")).body.user;
    assert.equal(me.lineId, u.lineId);
    const row = f.db.prepare("SELECT * FROM users WHERE id=?").get(u.id);
    assert.equal(row.first_name, u.firstName);
    assert.equal(row.last_name, u.lastName);
    assert.equal(row.phone, u.phone);
    assert.equal(row.discovery_source, u.discoverySource);
    assert.equal(row.line_id, u.lineId);
    assert.equal((await agent.get("/api/admin/members")).status, 403);
    assert.equal((await request(f.app).get("/api/admin/members")).status, 401);
    const admin = await login(f.app, f.admin);
    for (const query of ["66812345678", "shop.member"]) {
      const result = await admin.agent
        .get("/api/admin/members")
        .query({ q: query });
      assert.equal(result.status, 200);
      assert.equal(result.body.total, 1);
      assert.equal(result.body.items[0].line_id, u.lineId);
      assert.equal(result.body.items[0].discovery_source, u.discoverySource);
      assert.equal(result.body.items[0].password, undefined);
    }
    const referrer = await login(f.app, f.customer);
    const referrals = JSON.stringify(
      (await referrer.agent.get("/api/referrals")).body,
    );
    assert.ok(!referrals.includes(u.phone));
    assert.ok(!referrals.includes(u.lineId));
    const audit = JSON.stringify(
      f.db
        .prepare("SELECT details FROM audit WHERE action='member.registered'")
        .all(),
    );
    assert.ok(!audit.includes(u.phone));
    assert.ok(!audit.includes(u.lineId));
  } finally {
    f.db.close();
  }
});

test("registration validates missing names, telephone, source and LINE ID without creating partial accounts", async () => {
  const f = fixture();
  try {
    for (const [patch, field] of [
      [{ firstName: " " }, "firstName"],
      [{ lastName: "" }, "lastName"],
      [{ firstName: "x".repeat(81) }, "firstName"],
      [{ phone: "123" }, "phone"],
      [{ phone: "08123abc45" }, "phone"],
      [{ phone: "+00123456789" }, "phone"],
      [{ discoverySource: "x".repeat(121) }, "discoverySource"],
      [{ lineId: "bad<script>" }, "lineId"],
      [{ lineId: "x".repeat(101) }, "lineId"],
    ]) {
      const r = await request(f.app)
        .post("/api/auth/register")
        .send({ ...profile, ...patch });
      assert.equal(r.status, 400, field);
      assert.ok(
        r.body.fields.some((issue) => issue.path === field),
        JSON.stringify(r.body),
      );
    }
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM users").get().n, 3);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM sessions").get().n, 0);
    const r = await request(f.app).post("/api/auth/register").send({
      firstName: "Anne-Marie",
      lastName: "O’Neill",
      phone: "081 234 5678",
      email: profile.email,
      password: PASSWORD,
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.phone, "0812345678");
    assert.equal(r.body.user.discoverySource, "");
    assert.equal(r.body.user.lineId, "");
  } finally {
    f.db.close();
  }
});

test("profile migration preserves old names, passwords and balances and can run twice", () => {
  const directory = mkdtempSync(join(tmpdir(), "hiewly-profile-"));
  const path = join(directory, "legacy.sqlite");
  let db;
  try {
    db = openDb(path);
    const user = addUser(db, "customer", 54321);
    for (const field of [
      "first_name",
      "last_name",
      "phone",
      "discovery_source",
      "line_id",
    ])
      db.exec(`ALTER TABLE users DROP COLUMN ${field}`);
    for (const field of [
      "member_version",
      "must_change_password",
      "password_reset_expires_at",
      "has_password",
    ])
      db.exec(`ALTER TABLE users DROP COLUMN ${field}`);
    db.exec("PRAGMA user_version=2");
    db.close();
    db = undefined;
    for (let i = 0; i < 2; i++) {
      db = openDb(path);
      const row = db.prepare("SELECT * FROM users WHERE id=?").get(user.id);
      assert.equal(row.name, user.name);
      assert.equal(row.password, user.password);
      assert.equal(row.balance, 54321);
      assert.equal(row.member_version, 1);
      assert.equal(row.must_change_password, 0);
      assert.equal(row.password_reset_expires_at, null);
      assert.equal(row.has_password, 1);
      for (const field of [
        "first_name",
        "last_name",
        "phone",
        "discovery_source",
        "line_id",
      ])
        assert.equal(row[field], "");
      assert.equal(db.prepare("PRAGMA user_version").get().user_version, 15);
      db.close();
      db = undefined;
    }
  } finally {
    db?.close();
    for (const suffix of ["", "-wal", "-shm"])
      rmSync(path + suffix, { force: true });
    rmdirSync(directory);
  }
});
