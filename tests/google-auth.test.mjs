import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { fixture, login, mutate, PASSWORD } from "./helpers.mjs";
import { googleTestOptions, googleTestProvider } from "./google-provider.mjs";
import { hash, verifyAudit } from "../server/db.mjs";
import { safeGoogleNext } from "../server/google-auth.mjs";

function setup() {
  let f;
  const provider = googleTestProvider(() => f.db);
  f = fixture({
    google: googleTestOptions,
    googleTransport: provider,
    authRateLimit: 200,
  });
  return { ...f, provider };
}
const origin = "http://127.0.0.1:5174";
async function start(f, agent = request.agent(f.app), input = {}) {
  const response = await agent
    .post("/api/auth/google/start")
    .set("Origin", origin)
    .send(input);
  assert.equal(response.status, 200);
  const url = new URL(response.body.url),
    state = url.searchParams.get("state");
  return { agent, response, url, state };
}
async function callback(f, flow, claims = {}, mode = "valid") {
  const code = f.provider.code(
    flow.state,
    f.provider.claims(flow.state, claims),
    mode,
  );
  return flow.agent
    .get("/api/auth/google/callback")
    .query({ state: flow.state, code });
}
const profile = {
  action: "register",
  firstName: "ลูกค้า",
  lastName: "กูเกิล",
  phone: "081-234-5678",
  discoverySource: "Google",
  lineId: "@test",
};
const complete = (agent, data = profile) =>
  agent.post("/api/auth/google/complete").set("Origin", origin).send(data);

test("Google is optional; OAuth start requires store origin, uses state/nonce/PKCE and exposes no client secret", async () => {
  const disabled = fixture(),
    f = setup();
  try {
    assert.deepEqual(
      (await request(disabled.app).get("/api/auth/google/status")).body,
      { enabled: false },
    );
    assert.equal(
      (
        await request(disabled.app)
          .post("/api/auth/google/start")
          .set("Origin", origin)
          .send({})
      ).status,
      503,
    );
    assert.equal(
      (await request(f.app).post("/api/auth/google/start").send({})).status,
      403,
    );
    assert.equal(
      (
        await request(f.app)
          .post("/api/auth/google/start")
          .set("Origin", "https://evil.test")
          .send({})
      ).status,
      403,
    );
    const flow = await start(f, undefined, { next: "/\\evil.test" });
    assert.equal(flow.url.origin, "https://accounts.google.com");
    assert.equal(
      flow.url.searchParams.get("redirect_uri"),
      googleTestOptions.redirectUri,
    );
    assert.equal(flow.url.searchParams.get("scope"), "openid email profile");
    assert.equal(flow.url.searchParams.get("code_challenge_method"), "S256");
    const row = f.db.prepare("SELECT * FROM google_auth_attempts").get();
    assert.equal(row.state_hash, hash(flow.state));
    assert.equal(row.next, "/");
    assert.equal(row.nonce, flow.url.searchParams.get("nonce"));
    assert.equal(
      flow.url.searchParams.get("code_challenge"),
      Buffer.from(hash(row.verifier), "hex").toString("base64url"),
    );
    assert.match(flow.response.headers["set-cookie"].join(";"), /HttpOnly/);
    assert.match(flow.response.headers["set-cookie"].join(";"), /SameSite=Lax/);
    assert.ok(
      !JSON.stringify(flow.response.body).includes(
        googleTestOptions.clientSecret,
      ),
    );
    for (const value of [
      "//evil.test",
      "/\\evil.test",
      "https://evil.test",
      "/login?next=/admin",
      "/foo\r\nX:test",
    ])
      assert.equal(safeGoogleNext(value), "/");
  } finally {
    f.db.close();
    disabled.db.close();
  }
});
test("OAuth binds the initiating browser, rejects expiry, consumes denial and blocks replay before contacting Google", async () => {
  const f = setup();
  try {
    const flow = await start(f);
    const outsider = await request(f.app)
      .get("/api/auth/google/callback")
      .query({ state: flow.state, code: "stolen" });
    assert.match(outsider.headers.location, /google=failed$/);
    assert.equal(f.provider.calls, 0);
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM google_auth_attempts").get().n,
      1,
    );
    const denied = await flow.agent
      .get("/api/auth/google/callback")
      .query({ state: flow.state, error: "access_denied" });
    assert.match(denied.headers.location, /google=cancelled$/);
    assert.equal(
      (
        await flow.agent
          .get("/api/auth/google/callback")
          .query({ state: flow.state, code: "replay" })
      ).status,
      303,
    );
    assert.equal(f.provider.calls, 0);
    const expired = await start(f);
    f.db
      .prepare("UPDATE google_auth_attempts SET expires_at='2000-01-01'")
      .run();
    assert.match(
      (
        await expired.agent
          .get("/api/auth/google/callback")
          .query({ state: expired.state, code: "old" })
      ).headers.location,
      /google=failed$/,
    );
    assert.equal(f.provider.calls, 0);
  } finally {
    f.db.close();
  }
});
test("official verifier rejects invalid signature, audience, issuer, expired JWT, nonce, unverified email and provider failure", async () => {
  const f = setup();
  try {
    for (const [claims, mode] of [
      [{}, "bad-signature"],
      [{ aud: "attacker-client" }],
      [{ iss: "https://evil.test" }],
      [{ exp: Math.floor(Date.now() / 1000) - 600 }],
      [{ nonce: "wrong" }],
      [{ email_verified: false }],
      [{ email_verified: "true" }],
      [{ sub: "" }],
      [{}, "offline"],
    ]) {
      const flow = await start(f);
      const res = await callback(f, flow, claims, mode);
      assert.match(res.headers.location, /google=failed$/);
      assert.equal((await flow.agent.get("/api/me")).body.user, null);
      assert.equal(
        f.db.prepare("SELECT COUNT(*) n FROM google_pending").get().n,
        0,
      );
    }
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM google_identities").get().n,
      0,
    );
    assert.ok(
      !JSON.stringify(f.db.prepare("SELECT details FROM audit").all()).includes(
        "test-access",
      ),
    );
  } finally {
    f.db.close();
  }
});
test("new Google member completes required contact fields once, preserves referral, receives no privilege or balance and can log in again by subject", async () => {
  const f = setup();
  try {
    const flow = await start(f, undefined, {
      next: "/admin",
      referralCode: f.other.referral_code,
    });
    assert.equal(
      (await callback(f, flow)).headers.location,
      origin + "/google/complete",
    );
    const p = await flow.agent.get("/api/auth/google/pending");
    assert.equal(p.body.email, "google@test.example");
    assert.equal(p.body.existingAccount, false);
    assert.equal(
      (await complete(flow.agent, { ...profile, phone: "wrong" })).status,
      400,
    );
    assert.equal(
      (await complete(flow.agent, { ...profile, role_id: "admin" })).status,
      400,
    );
    assert.equal(
      (await complete(flow.agent, { ...profile, email: "fake@test.example" }))
        .status,
      400,
    );
    const res = await complete(flow.agent);
    assert.equal(res.status, 200);
    assert.equal(res.body.redirectTo, "/");
    assert.equal(res.body.user.hasPassword, false);
    const user = f.db
      .prepare("SELECT * FROM users WHERE id=?")
      .get(res.body.user.id);
    assert.equal(user.role_id, "customer");
    assert.equal(user.balance, 0);
    assert.equal(user.phone, "0812345678");
    assert.equal(user.referred_by, f.other.id);
    assert.equal((await complete(flow.agent)).status, 401);
    assert.equal((await flow.agent.get("/api/me")).body.user.id, user.id);
    assert.equal(
      (
        await request(f.app)
          .post("/api/auth/login")
          .send({ email: user.email, password: PASSWORD })
      ).status,
      401,
    );
    const returning = await start(f);
    const logged = await callback(f, returning, {
      email: "changed-at-google@test.example",
    });
    assert.equal(logged.headers.location, origin + "/");
    assert.equal((await returning.agent.get("/api/me")).body.user.id, user.id);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM users").get().n, 4);
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM google_auth_attempts").get().n,
      0,
    );
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM google_pending").get().n,
      0,
    );
    assert.equal(verifyAudit(f.db).valid, true);
  } finally {
    f.db.close();
  }
});
test("matching existing email never auto-links: correct original password preserves account and role; wrong passwords are capped", async () => {
  const f = setup();
  try {
    const flow = await start(f, undefined, { next: "/admin/members" });
    await callback(f, flow, { email: f.admin.email });
    assert.equal((await flow.agent.get("/api/me")).body.user, null);
    assert.equal(
      (await flow.agent.get("/api/auth/google/pending")).body.existingAccount,
      true,
    );
    assert.equal(
      (await complete(flow.agent, { action: "register", ...profile })).status,
      409,
    );
    assert.equal(
      (await complete(flow.agent, { action: "link", password: "wrong" }))
        .status,
      401,
    );
    const linked = await complete(flow.agent, {
      action: "link",
      password: PASSWORD,
    });
    assert.equal(linked.status, 200);
    assert.equal(linked.body.user.id, f.admin.id);
    assert.equal(linked.body.user.roleId, "admin");
    assert.equal(linked.body.redirectTo, "/admin/members");
    const returning = await start(f);
    assert.equal(
      (await callback(f, returning, { email: f.admin.email })).headers.location,
      origin + "/",
    );
    const capped = await start(f);
    await callback(f, capped, {
      sub: "other-subject",
      email: f.customer.email,
    });
    for (let i = 0; i < 5; i++)
      assert.equal(
        (await complete(capped.agent, { action: "link", password: "wrong" }))
          .status,
        401,
      );
    assert.equal(
      (await complete(capped.agent, { action: "link", password: PASSWORD }))
        .status,
      401,
    );
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM google_identities").get().n,
      1,
    );
  } finally {
    f.db.close();
  }
});
test("disabled accounts and forced password resets cannot be bypassed by Google; expired pending cannot create members", async () => {
  const f = setup();
  try {
    f.db
      .prepare("INSERT INTO google_identities VALUES(?,?,?)")
      .run("google-test-subject", f.customer.id, new Date().toISOString());
    f.db.prepare("UPDATE users SET active=0 WHERE id=?").run(f.customer.id);
    const disabled = await start(f);
    assert.match(
      (await callback(f, disabled)).headers.location,
      /google=failed$/,
    );
    f.db
      .prepare(
        "UPDATE users SET active=1,must_change_password=1,password_reset_expires_at=? WHERE id=?",
      )
      .run(new Date(Date.now() + 60000).toISOString(), f.customer.id);
    const forced = await start(f);
    assert.equal(
      (await callback(f, forced)).headers.location,
      origin + "/account",
    );
    assert.equal((await forced.agent.get("/api/wallet")).status, 403);
    f.db
      .prepare(
        "UPDATE users SET password_reset_expires_at='2000-01-01' WHERE id=?",
      )
      .run(f.customer.id);
    const expired = await start(f);
    assert.match(
      (await callback(f, expired)).headers.location,
      /google=failed$/,
    );
    const fresh = await start(f);
    await callback(f, fresh, { sub: "new-subject" });
    f.db.prepare("UPDATE google_pending SET expires_at='2000-01-01'").run();
    assert.equal((await complete(fresh.agent)).status, 401);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM users").get().n, 3);
  } finally {
    f.db.close();
  }
});
test("admin email changes unlink Google; Google-only account must get a password reset first and old Google identity cannot restore access", async () => {
  const f = setup();
  try {
    const admin = await login(f.app, f.admin);
    f.db
      .prepare("INSERT INTO google_identities VALUES(?,?,?)")
      .run("google-test-subject", f.customer.id, new Date().toISOString());
    f.db
      .prepare("UPDATE users SET has_password=0 WHERE id=?")
      .run(f.customer.id);
    const path = `/api/admin/members/${f.customer.id}`;
    const data = {
      firstName: "ชื่อ",
      lastName: "ทดสอบ",
      phone: "0812345678",
      email: "new@test.example",
      version: 1,
      actorPassword: PASSWORD,
    };
    assert.equal(
      (await mutate(admin, path + "/profile", data, "put")).status,
      409,
    );
    assert.equal(
      (
        await mutate(admin, path + "/reset-password", {
          version: 1,
          actorPassword: PASSWORD,
        })
      ).status,
      200,
    );
    assert.equal(
      (await mutate(admin, path + "/profile", { ...data, version: 2 }, "put"))
        .status,
      200,
    );
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM google_identities").get().n,
      0,
    );
    assert.equal(
      f.db
        .prepare("SELECT has_password FROM users WHERE id=?")
        .get(f.customer.id).has_password,
      1,
    );
  } finally {
    f.db.close();
  }
});
