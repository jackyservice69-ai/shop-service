import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { fixture, login } from "./helpers.mjs";
import { hash, now, setSetting } from "../server/db.mjs";
import { googleTestOptions, googleTestProvider } from "./google-provider.mjs";
import { LINE_CHANNEL, lineTestProvider } from "./line-provider.mjs";

const origin = "http://127.0.0.1:5174";
function setup() {
  let f;
  const google = googleTestProvider(() => f.db);
  f = fixture({
    google: googleTestOptions,
    googleTransport: google,
    authRateLimit: 200,
  });
  const line = lineTestProvider(() => f.db);
  f.config.fetch = line.fetch;
  f.config.secrets.lineLoginChannelSecret = "isolated-line-login-secret";
  setSetting(f.db, "lineLoginEnabled", true);
  setSetting(f.db, "lineLoginChannelId", LINE_CHANNEL);
  return { ...f, google, line };
}
async function begin(client, provider) {
  const response = await client.agent
    .post(`/api/auth/${provider}/start`)
    .set("Origin", origin)
    .set("x-csrf-token", client.csrf)
    .send({ intent: "link" });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const state = new URL(response.body.url).searchParams.get("state");
  return { state, agent: client.agent };
}
function callback(f, flow, provider, claims = {}) {
  const code =
    provider === "line"
      ? f.line.code(flow.state, claims)
      : f.google.code(flow.state, f.google.claims(flow.state, claims));
  return flow.agent
    .get(`/api/auth/${provider}/callback`)
    .query({ state: flow.state, code });
}
for (const provider of ["line", "google"]) {
  test(`${provider}: signed-in members link without password; valid older passwordless sessions also work`, async () => {
    for (const hasPassword of [1, 0]) {
      const f = setup();
      try {
        const client = await login(f.app, f.customer);
        f.db
          .prepare("UPDATE users SET has_password=? WHERE id=?")
          .run(hasPassword, f.customer.id);
        f.db
          .prepare("UPDATE sessions SET expires_at=? WHERE user_id=?")
          .run(new Date(Date.now() + 7 * 3600000).toISOString(), f.customer.id);
        const before = (await client.agent.get("/api/me")).body.user;
        const flow = await begin(client, provider);
        const proof = f.db
          .prepare("SELECT * FROM social_link_flows WHERE state_hash=?")
          .get(hash(flow.state));
        assert.equal(proof.user_id, f.customer.id);
        assert.equal(proof.provider, provider);
        assert.ok(proof.expires_at > now());
        assert.match(
          (await callback(f, flow, provider)).headers.location,
          new RegExp(`/account\\?${provider}=linked$`),
        );
        const after = (await client.agent.get("/api/me")).body.user;
        for (const key of ["id", "email", "roleId", "balance"])
          assert.equal(after[key], before[key]);
        assert.equal(
          (await client.agent.get("/api/auth/connections")).body[provider]
            .linked,
          true,
        );
        assert.equal(
          f.db.prepare("SELECT count(*) n FROM social_link_flows").get().n,
          0,
        );
      } finally {
        f.db.close();
      }
    }
  });

  test(`${provider}: passwordless linking retains login, CSRF, Origin, expiry and reset guards`, async () => {
    const f = setup();
    try {
      const path = `/api/auth/${provider}/start`;
      assert.equal(
        (
          await request(f.app)
            .post(path)
            .set("Origin", origin)
            .send({ intent: "link" })
        ).status,
        401,
      );
      const client = await login(f.app, f.customer);
      assert.equal(
        (
          await client.agent
            .post(path)
            .set("Origin", origin)
            .send({ intent: "link" })
        ).status,
        403,
      );
      assert.equal(
        (
          await client.agent
            .post(path)
            .set("Origin", origin)
            .set("x-csrf-token", "wrong")
            .send({ intent: "link" })
        ).status,
        403,
      );
      assert.equal(
        (
          await client.agent
            .post(path)
            .set("Origin", "https://evil.example")
            .set("x-csrf-token", client.csrf)
            .send({ intent: "link" })
        ).status,
        403,
      );
      assert.equal(
        (
          await client.agent
            .post(path)
            .set("x-csrf-token", client.csrf)
            .send({ intent: "link" })
        ).status,
        403,
      );
      f.db
        .prepare(
          "UPDATE users SET must_change_password=1,password_reset_expires_at=? WHERE id=?",
        )
        .run(new Date(Date.now() + 3600000).toISOString(), f.customer.id);
      assert.equal(
        (
          await client.agent
            .post(path)
            .set("Origin", origin)
            .set("x-csrf-token", client.csrf)
            .send({ intent: "link" })
        ).status,
        403,
      );
      f.db
        .prepare("UPDATE users SET must_change_password=0,active=0 WHERE id=?")
        .run(f.customer.id);
      assert.equal(
        (
          await client.agent
            .post(path)
            .set("Origin", origin)
            .set("x-csrf-token", client.csrf)
            .send({ intent: "link" })
        ).status,
        401,
      );
      f.db.prepare("UPDATE users SET active=1 WHERE id=?").run(f.customer.id);
      f.db
        .prepare("UPDATE sessions SET expires_at=? WHERE user_id=?")
        .run("2000-01-01", f.customer.id);
      assert.equal(
        (
          await client.agent
            .post(path)
            .set("Origin", origin)
            .set("x-csrf-token", client.csrf)
            .send({ intent: "link" })
        ).status,
        401,
      );
      assert.equal(
        f.db.prepare("SELECT count(*) n FROM social_link_flows").get().n,
        0,
      );
      assert.equal(
        f.db.prepare(`SELECT count(*) n FROM ${provider}_identities`).get().n,
        0,
      );
    } finally {
      f.db.close();
    }
  });

  test(`${provider}: linking still rejects another member's identity and revoked initiating sessions`, async () => {
    const f = setup();
    try {
      const owner = await login(f.app, f.customer);
      assert.match(
        (await callback(f, await begin(owner, provider), provider)).headers
          .location,
        new RegExp(`${provider}=linked$`),
      );
      const other = await login(f.app, f.other);
      assert.match(
        (await callback(f, await begin(other, provider), provider)).headers
          .location,
        new RegExp(`${provider}=link_failed$`),
      );
      assert.equal(
        f.db.prepare(`SELECT user_id FROM ${provider}_identities`).get()
          .user_id,
        f.customer.id,
      );
      const pending = await begin(other, provider);
      f.db.prepare("DELETE FROM sessions WHERE user_id=?").run(f.other.id);
      assert.match(
        (
          await callback(f, pending, provider, {
            sub:
              provider === "line"
                ? "U" + "3".repeat(32)
                : "new-google-after-session-revocation",
          })
        ).headers.location,
        new RegExp(`${provider}=link_failed$`),
      );
      assert.equal(
        f.db.prepare(`SELECT count(*) n FROM ${provider}_identities`).get().n,
        1,
      );
    } finally {
      f.db.close();
    }
  });
}
