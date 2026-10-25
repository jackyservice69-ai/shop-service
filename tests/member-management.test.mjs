import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { fixture, login, mutate, PASSWORD, addUser } from "./helpers.mjs";
import { passwordMatches, verifyAudit } from "../server/db.mjs";
const profile = (extra = {}) => ({
  firstName: "ชื่อใหม่",
  lastName: "นามสกุลใหม่",
  phone: "081-234-5678",
  email: "edited@test.example",
  discoverySource: "Facebook",
  lineId: "@customer",
  version: 1,
  actorPassword: PASSWORD,
  ...extra,
});
test("customer profile management requires the extra permission, CSRF and operator password; blocks staff/admin targets and privilege fields", async () => {
  const f = fixture(),
    a = await login(f.app, f.admin),
    c = await login(f.app, f.customer);
  try {
    f.db
      .prepare("INSERT INTO roles VALUES(?,?,?)")
      .run("viewer", "ดูสมาชิกเท่านั้น", JSON.stringify(["members"]));
    const staff = await login(f.app, addUser(f.db, "viewer")),
      path = `/api/admin/members/${f.customer.id}/profile`;
    assert.equal((await request(f.app).put(path).send(profile())).status, 401);
    assert.equal((await mutate(c, path, profile(), "put")).status, 403);
    assert.equal((await mutate(staff, path, profile(), "put")).status, 403);
    assert.equal((await a.agent.put(path).send(profile())).status, 403);
    assert.equal(
      (await mutate(a, path, profile({ actorPassword: "wrong" }), "put"))
        .status,
      400,
    );
    assert.equal(
      (
        await mutate(
          a,
          path,
          profile({ role_id: "admin", balance: 100 }),
          "put",
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await mutate(
          a,
          `/api/admin/members/${f.admin.id}/profile`,
          profile(),
          "put",
        )
      ).status,
      403,
    );
    assert.equal(
      f.db
        .prepare("SELECT member_version FROM users WHERE id=?")
        .get(f.customer.id).member_version,
      1,
    );
  } finally {
    f.db.close();
  }
});
test("editing a customer normalizes fields, rejects duplicate/stale values, revokes sessions and preserves financial history", async () => {
  const f = fixture(),
    a = await login(f.app, f.admin),
    c = await login(f.app, f.customer),
    second = await login(f.app, f.customer);
  try {
    const path = `/api/admin/members/${f.customer.id}/profile`,
      before = f.db
        .prepare("SELECT * FROM users WHERE id=?")
        .get(f.customer.id);
    assert.equal(
      (await mutate(a, path, profile({ email: f.other.email }), "put")).status,
      409,
    );
    assert.equal(
      (await mutate(a, path, profile({ phone: "bad" }), "put")).status,
      400,
    );
    assert.equal(
      (await mutate(a, path, profile({ email: "EDITED@Test.Example" }), "put"))
        .status,
      200,
    );
    const after = f.db
      .prepare("SELECT * FROM users WHERE id=?")
      .get(f.customer.id);
    assert.equal(after.name, "ชื่อใหม่ นามสกุลใหม่");
    assert.equal(after.phone, "0812345678");
    assert.equal(after.email, "edited@test.example");
    assert.equal(after.member_version, 2);
    for (const key of [
      "password",
      "balance",
      "role_id",
      "referral_code",
      "referred_by",
      "created_at",
    ])
      assert.equal(after[key], before[key]);
    assert.equal((await c.agent.get("/api/me")).body.user, null);
    assert.equal((await second.agent.get("/api/me")).body.user, null);
    assert.equal((await mutate(a, path, profile(), "put")).status, 409);
    assert.equal(
      (
        await request(f.app)
          .post("/api/auth/login")
          .send({ email: before.email, password: PASSWORD })
      ).status,
      401,
    );
    assert.equal(
      (
        await request(f.app)
          .post("/api/auth/login")
          .send({ email: after.email, password: PASSWORD })
      ).status,
      200,
    );
    const audit = (await a.agent.get("/api/admin/audit")).text;
    assert.ok(!audit.includes("edited@test.example"));
    assert.ok(!audit.includes("@customer"));
    assert.ok(!audit.includes(PASSWORD));
    assert.ok(verifyAudit(f.db).valid);
  } finally {
    f.db.close();
  }
});
test("temporary reset revokes all sessions, expires, blocks protected reads/writes until confirmed fresh password and never persists plaintext", async () => {
  const f = fixture(),
    a = await login(f.app, f.admin),
    c = await login(f.app, f.customer),
    second = await login(f.app, f.customer);
  try {
    const path = `/api/admin/members/${f.customer.id}/reset-password`,
      body = { version: 1, actorPassword: PASSWORD };
    assert.equal(
      (await mutate(a, path, { ...body, actorPassword: "wrong" })).status,
      400,
    );
    const r = await mutate(a, path, body);
    assert.equal(r.status, 200);
    assert.match(r.headers["cache-control"], /no-store/);
    const temp = r.body.temporaryPassword;
    assert.equal(temp.length, 24);
    const u = f.db.prepare("SELECT * FROM users WHERE id=?").get(f.customer.id);
    assert.notEqual(u.password, temp);
    assert.ok(passwordMatches(temp, u.password));
    assert.equal(u.must_change_password, 1);
    assert.equal(u.member_version, 2);
    assert.equal((await c.agent.get("/api/me")).body.user, null);
    assert.equal((await second.agent.get("/api/wallet")).status, 401);
    assert.equal((await mutate(a, path, body)).status, 409);
    assert.equal(
      (
        await request(f.app)
          .post("/api/auth/login")
          .send({ email: u.email, password: PASSWORD })
      ).status,
      401,
    );
    const pending = request.agent(f.app),
      sign = await pending
        .post("/api/auth/login")
        .send({ email: u.email, password: temp });
    assert.equal(sign.status, 200);
    assert.equal(sign.body.user.mustChangePassword, true);
    for (const p of [
      "/api/wallet",
      "/api/addresses",
      "/api/orders",
      "/api/consignment",
    ])
      assert.equal((await pending.get(p)).status, 403);
    assert.equal(
      (
        await pending
          .post("/api/orders")
          .set("x-csrf-token", sign.body.csrf)
          .send({})
      ).status,
      403,
    );
    const change = (v) =>
        pending
          .post("/api/auth/password")
          .set("x-csrf-token", sign.body.csrf)
          .send(v),
      password = "Priv8!xx";
    assert.equal((await change({ current: temp, password })).status, 400);
    assert.equal(
      (await change({ current: temp, password: temp, confirmPassword: temp }))
        .status,
      400,
    );
    assert.equal(
      (await change({ current: temp, password, confirmPassword: password }))
        .status,
      200,
    );
    assert.equal((await pending.get("/api/me")).body.user, null);
    assert.equal(
      (
        await request(f.app)
          .post("/api/auth/login")
          .send({ email: u.email, password: temp })
      ).status,
      401,
    );
    const signed = await request(f.app)
      .post("/api/auth/login")
      .send({ email: u.email, password });
    assert.equal(signed.status, 200);
    assert.equal(signed.body.user.mustChangePassword, false);
    assert.equal(
      f.db
        .prepare("SELECT password_reset_expires_at FROM users WHERE id=?")
        .get(u.id).password_reset_expires_at,
      null,
    );
    const audit = f.db
      .prepare("SELECT details FROM audit")
      .all()
      .map((r) => r.details)
      .join("");
    assert.ok(!audit.includes(temp));
    assert.ok(!audit.includes(PASSWORD));
    assert.ok(!audit.includes(password));
    assert.ok(verifyAudit(f.db).valid);
    const newReset = await mutate(a, path, {
      version: 3,
      actorPassword: PASSWORD,
    });
    assert.equal(newReset.status, 200);
    f.db
      .prepare("UPDATE users SET password_reset_expires_at=? WHERE id=?")
      .run("2000-01-01T00:00:00.000Z", u.id);
    assert.equal(
      (
        await request(f.app)
          .post("/api/auth/login")
          .send({ email: u.email, password: newReset.body.temporaryPassword })
      ).status,
      401,
    );
  } finally {
    f.db.close();
  }
});
test("read-only staff cannot reset customers; inactive, missing and privileged targets are rejected; sensitive confirmation is throttled", async () => {
  const f = fixture(),
    a = await login(f.app, f.admin);
  try {
    f.db
      .prepare("INSERT INTO roles VALUES(?,?,?)")
      .run(
        "member-manager",
        "ทีมดูแลลูกค้า",
        JSON.stringify(["members", "member_edit"]),
      );
    const staffUser = addUser(f.db, "member-manager"),
      staff = await login(f.app, staffUser);
    assert.equal(
      (
        await mutate(
          staff,
          `/api/admin/members/${f.customer.id}/profile`,
          profile(),
          "put",
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await mutate(
          staff,
          `/api/admin/members/${staffUser.id}/reset-password`,
          { version: 1, actorPassword: PASSWORD },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await mutate(a, "/api/admin/members/missing/reset-password", {
          version: 1,
          actorPassword: PASSWORD,
        })
      ).status,
      404,
    );
    f.db.prepare("UPDATE users SET active=0 WHERE id=?").run(f.other.id);
    assert.equal(
      (
        await mutate(a, `/api/admin/members/${f.other.id}/reset-password`, {
          version: 1,
          actorPassword: PASSWORD,
        })
      ).status,
      409,
    );
    for (let i = 0; i < 8; i++)
      assert.equal(
        (
          await mutate(
            a,
            `/api/admin/members/${f.customer.id}/reset-password`,
            { version: 2, actorPassword: "wrong" },
          )
        ).status,
        400,
      );
    assert.equal(
      (
        await mutate(a, `/api/admin/members/${f.customer.id}/reset-password`, {
          version: 2,
          actorPassword: PASSWORD,
        })
      ).status,
      429,
    );
  } finally {
    f.db.close();
  }
});
