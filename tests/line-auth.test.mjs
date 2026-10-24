import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { fixture, login, mutate, PASSWORD } from "./helpers.mjs";
import { getSettings, hash, setSetting, verifyAudit } from "../server/db.mjs";
import {
  LINE_ID,
  LINE_OTHER,
  LINE_CHANNEL,
  lineTestProvider,
} from "./line-provider.mjs";
import { googleTestOptions, googleTestProvider } from "./google-provider.mjs";
const origin = "http://127.0.0.1:5174";
function setup() {
  const f = fixture({ authRateLimit: 200, google: googleTestOptions });
  const provider = lineTestProvider(() => f.db);
  f.config.fetch = provider.fetch;
  f.config.secrets.lineLoginChannelSecret = "isolated-line-login-secret";
  setSetting(f.db, "lineLoginEnabled", true);
  setSetting(f.db, "lineLoginChannelId", LINE_CHANNEL);
  return { ...f, provider };
}
async function start(f, client, input = {}, provider = "line") {
  const agent = client?.agent || request.agent(f.app);
  let req = agent.post(`/api/auth/${provider}/start`).set("Origin", origin);
  if (client?.csrf) req = req.set("x-csrf-token", client.csrf);
  const response = await req.send(input);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const url = new URL(response.body.url);
  return { agent, response, url, state: url.searchParams.get("state") };
}
function callback(f, flow, claims = {}, mode = "valid") {
  const code = f.provider.code(flow.state, claims, mode);
  return flow.agent
    .get("/api/auth/line/callback")
    .query({ state: flow.state, code });
}
const profile = {
  firstName: "ลูกค้า",
  lastName: "ไลน์",
  phone: "0812345678",
  email: "new-line@example.test",
  password: PASSWORD,
};
const complete = (flow, data = profile) =>
  flow.agent.post("/api/auth/line/complete").set("Origin", origin).send(data);

test("LINE is optional; start enforces Origin and PKCE/state/nonce without exposing credentials", async () => {
  const disabled = fixture(),
    f = setup();
  try {
    assert.deepEqual(
      (await request(disabled.app).get("/api/auth/line/status")).body,
      { enabled: false },
    );
    assert.equal(
      (
        await request(disabled.app)
          .post("/api/auth/line/start")
          .set("Origin", origin)
          .send({})
      ).status,
      503,
    );
    assert.equal(
      (await request(f.app).post("/api/auth/line/start").send({})).status,
      403,
    );
    const flow = await start(f, null, { next: "//evil.example" });
    assert.equal(flow.url.origin, "https://access.line.me");
    assert.equal(
      flow.url.searchParams.get("redirect_uri"),
      origin + "/api/auth/line/callback",
    );
    assert.equal(flow.url.searchParams.get("scope"), "openid profile");
    assert.equal(flow.url.searchParams.get("code_challenge_method"), "S256");
    const row = f.db.prepare("SELECT * FROM line_auth_attempts").get();
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
        "isolated-line-login-secret",
      ),
    );
  } finally {
    disabled.db.close();
    f.db.close();
  }
});

test("LINE callbacks bind browser, consume denial/replay, reject expiry/config changes and invalid verified claims", async () => {
  const f = setup();
  try {
    const flow = await start(f);
    assert.match(
      (
        await request(f.app)
          .get("/api/auth/line/callback")
          .query({ state: flow.state, code: "stolen" })
      ).headers.location,
      /line=failed/,
    );
    assert.equal(f.provider.calls.length, 0);
    assert.match(
      (
        await flow.agent
          .get("/api/auth/line/callback")
          .query({ state: flow.state, error: "access_denied" })
      ).headers.location,
      /line=cancelled/,
    );
    assert.match(
      (
        await flow.agent
          .get("/api/auth/line/callback")
          .query({ state: flow.state, code: "replay" })
      ).headers.location,
      /line=failed/,
    );
    for (const claims of [
      { nonce: "wrong" },
      { iss: "https://evil.test" },
      { aud: "other" },
      { exp: 1 },
      { sub: "@typed-line-id" },
      { iat: Date.now() },
    ]) {
      const invalid = await start(f);
      assert.match(
        (await callback(f, invalid, claims)).headers.location,
        /line=failed/,
      );
    }
    const expired = await start(f);
    f.db.prepare("UPDATE line_auth_attempts SET expires_at='2000-01-01'").run();
    assert.match(
      (
        await expired.agent
          .get("/api/auth/line/callback")
          .query({ state: expired.state, code: "expired" })
      ).headers.location,
      /line=failed/,
    );
    const changed = await start(f);
    const code = f.provider.code(changed.state);
    setSetting(f.db, "lineLoginChannelId", "9876543210");
    assert.match(
      (
        await changed.agent
          .get("/api/auth/line/callback")
          .query({ state: changed.state, code })
      ).headers.location,
      /line=failed/,
    );
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM line_identities").get().n,
      0,
    );
  } finally {
    f.db.close();
  }
});

test("LINE registration creates one customer, preserves referral and returning login uses that member", async () => {
  const f = setup();
  try {
    const flow = await start(f, null, { referralCode: f.other.referral_code });
    assert.match((await callback(f, flow)).headers.location, /line\/complete$/);
    assert.equal(
      (await complete(flow, { ...profile, phone: "invalid" })).status,
      400,
    );
    const response = await complete(flow);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const user = response.body.user;
    assert.equal(user.roleId, "customer");
    assert.equal(user.balance, 0);
    assert.equal(user.hasPassword, true);
    assert.equal(
      f.db.prepare("SELECT referred_by FROM users WHERE id=?").get(user.id)
        .referred_by,
      f.other.id,
    );
    assert.equal((await complete(flow)).status, 401);
    const returning = await start(f);
    assert.equal((await callback(f, returning)).headers.location, origin + "/");
    assert.equal((await returning.agent.get("/api/me")).body.user.id, user.id);
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM line_identities").get().n,
      1,
    );
    assert.ok(verifyAudit(f.db).valid);
  } finally {
    f.db.close();
  }
});

test("LINE never auto-merges user-entered email; explicit link requires CSRF/password and prevents identity stealing", async () => {
  const f = setup();
  try {
    const flow = await start(f);
    await callback(f, flow);
    assert.equal(
      (await complete(flow, { ...profile, email: f.customer.email })).status,
      409,
    );
    const client = await login(f.app, f.customer);
    assert.equal(
      (
        await client.agent
          .post("/api/auth/line/start")
          .set("Origin", origin)
          .send({ intent: "link", password: PASSWORD })
      ).status,
      403,
    );
    assert.equal(
      (
        await client.agent
          .post("/api/auth/line/start")
          .set("Origin", origin)
          .set("x-csrf-token", client.csrf)
          .send({ intent: "link", password: "wrong" })
      ).status,
      401,
    );
    const linked = await start(f, client, {
      intent: "link",
      password: PASSWORD,
    });
    assert.match(
      (await callback(f, linked)).headers.location,
      /account\?line=linked$/,
    );
    assert.equal(
      (await client.agent.get("/api/auth/connections")).body.line.linked,
      true,
    );
    const other = await login(f.app, f.other);
    const stolen = await start(f, other, {
      intent: "link",
      password: PASSWORD,
    });
    assert.match(
      (await callback(f, stolen)).headers.location,
      /line=link_failed$/,
    );
    assert.equal(
      f.db
        .prepare("SELECT user_id FROM line_identities WHERE subject=?")
        .get(LINE_ID).user_id,
      f.customer.id,
    );
    const replace = await start(f, client, {
      intent: "link",
      password: PASSWORD,
    });
    assert.match(
      (await callback(f, replace, { sub: LINE_OTHER })).headers.location,
      /line=link_failed$/,
    );
    assert.equal(
      (await client.agent.get("/api/me")).body.user.email,
      f.customer.email,
    );
  } finally {
    f.db.close();
  }
});

test("link proof expires when initiating session is revoked; Google explicit linking keeps account/email/wallet", async () => {
  const f = setup();
  try {
    const client = await login(f.app, f.customer);
    const flow = await start(f, client, { intent: "link", password: PASSWORD });
    f.db.prepare("DELETE FROM sessions WHERE user_id=?").run(f.customer.id);
    assert.match(
      (await callback(f, flow)).headers.location,
      /line=link_failed/,
    );
    // Google transport is constructed at app creation; build a separate fixture.
    let g;
    const provider = googleTestProvider(() => g.db);
    g = fixture({
      google: googleTestOptions,
      googleTransport: provider,
      authRateLimit: 200,
    });
    try {
      const local = await login(g.app, g.customer);
      const begin = await start(
        g,
        local,
        { intent: "link", password: PASSWORD },
        "google",
      );
      const code = provider.code(
        begin.state,
        provider.claims(begin.state, {
          email: "different@example.test",
          sub: "new-google-link",
        }),
      );
      const done = await begin.agent
        .get("/api/auth/google/callback")
        .query({ state: begin.state, code });
      assert.match(done.headers.location, /account\?google=linked$/);
      assert.equal(
        g.db
          .prepare(
            "SELECT user_id FROM google_identities WHERE subject='new-google-link'",
          )
          .get().user_id,
        g.customer.id,
      );
      assert.equal(
        (await local.agent.get("/api/me")).body.user.email,
        g.customer.email,
      );
      assert.equal((await local.agent.get("/api/me")).body.user.balance, 0);
    } finally {
      g.db.close();
    }
  } finally {
    f.db.close();
  }
});

test("only owner configures LINE Login; secrets remain encrypted/redacted and enabling incomplete funding is rejected", async () => {
  const f = setup();
  try {
    const owner = await login(f.app, f.admin),
      customer = await login(f.app, f.customer);
    const input = {
      ...getSettings(f.db),
      lineLoginChannelSecret: "configured-private-login-secret",
      lineTopupEnabled: true,
      botEnabled: true,
    };
    assert.equal(
      (await mutate(customer, "/api/admin/settings", input, "put")).status,
      403,
    );
    assert.equal(
      (await mutate(owner, "/api/admin/settings", input, "put")).status,
      200,
    );
    const read = await owner.agent.get("/api/admin/settings");
    assert.equal(read.body.lineLoginChannelSecretConfigured, true);
    assert.equal(
      read.body.lineLoginCallback,
      origin + "/api/auth/line/callback",
    );
    assert.equal(read.body.lineLoginReady, true);
    assert.equal(read.body.lineLoginChannelSecret, undefined);
    assert.ok(
      !f.db
        .prepare(
          "SELECT value FROM settings WHERE key='lineLoginChannelSecret'",
        )
        .get()
        .value.includes(input.lineLoginChannelSecret),
    );
    assert.ok(
      !JSON.stringify(f.db.prepare("SELECT details FROM audit").all()).includes(
        input.lineLoginChannelSecret,
      ),
    );
    assert.equal(
      (
        await mutate(
          owner,
          "/api/admin/settings",
          { ...input, lineLoginEnabled: false },
          "put",
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await mutate(
          owner,
          "/api/admin/settings",
          { ...input, lineLoginChannelId: "" },
          "put",
        )
      ).status,
      400,
    );
  } finally {
    f.db.close();
  }
});
