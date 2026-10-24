import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { fixture, login, PASSWORD } from "./helpers.mjs";
import { id, now, setSetting, verifyAudit } from "../server/db.mjs";
import { googleTestOptions } from "./google-provider.mjs";
const origin = "http://127.0.0.1:5174";
function setup() {
  const f = fixture({ google: googleTestOptions, authRateLimit: 200 });
  f.config.secrets.lineLoginChannelSecret = "test-secret";
  setSetting(f.db, "lineLoginEnabled", true);
  setSetting(f.db, "lineLoginChannelId", "1234567890");
  return f;
}
function attach(f, provider, user = f.customer) {
  if (provider === "line")
    f.db
      .prepare("INSERT INTO line_identities VALUES(?,?,?,?,?,?)")
      .run("U" + id(), user.id, "1234567890", "ทดสอบ LINE", id(), now());
  else
    f.db
      .prepare("INSERT INTO google_identities VALUES(?,?,?)")
      .run(id(), user.id, now());
}
async function fingerprint(client, provider) {
  return (await client.agent.get("/api/auth/connections")).body[provider]
    .connectionId;
}
function unlink(client, provider, connectionId, password = PASSWORD) {
  return client.agent
    .post(`/api/auth/${provider}/unlink`)
    .set("Origin", origin)
    .set("x-csrf-token", client.csrf)
    .send({ connectionId, password });
}

for (const provider of ["line", "google"]) {
  test(`${provider} disconnect requires owner session, Origin, CSRF, password and matching current binding; revokes other sessions and pending links, preserves money`, async () => {
    const f = setup();
    try {
      attach(f, provider);
      const client = await login(f.app, f.customer),
        otherSession = await login(f.app, f.customer),
        intruder = await login(f.app, f.other);
      const connectionId = await fingerprint(client, provider),
        path = `/api/auth/${provider}/unlink`,
        table = `${provider}_identities`;
      const body = { connectionId, password: PASSWORD };
      assert.equal(
        (await request(f.app).post(path).set("Origin", origin).send(body))
          .status,
        401,
      );
      assert.equal(
        (
          await client.agent
            .post(path)
            .set("Origin", "https://evil.example")
            .set("x-csrf-token", client.csrf)
            .send(body)
        ).status,
        403,
      );
      assert.equal(
        (
          await client.agent
            .post(path)
            .set("x-csrf-token", client.csrf)
            .send(body)
        ).status,
        403,
      );
      assert.equal(
        (await client.agent.post(path).set("Origin", origin).send(body)).status,
        403,
      );
      assert.equal(
        (await unlink(client, provider, connectionId, "wrong")).status,
        401,
      );
      assert.equal(
        (await unlink(client, provider, "a".repeat(64))).status,
        409,
      );
      assert.equal(
        (await unlink(intruder, provider, connectionId)).status,
        409,
      );
      const pending = await client.agent
        .post(`/api/auth/${provider}/start`)
        .set("Origin", origin)
        .set("x-csrf-token", client.csrf)
        .send({ intent: "link", password: PASSWORD });
      assert.equal(pending.status, 200);
      const before = f.db
        .prepare("SELECT balance FROM users WHERE id=?")
        .get(f.customer.id).balance;
      const ledger = f.db.prepare("SELECT COUNT(*) n FROM ledger").get().n;
      const done = await unlink(client, provider, connectionId);
      assert.equal(done.status, 200, JSON.stringify(done.body));
      assert.equal(
        f.db
          .prepare(`SELECT COUNT(*) n FROM ${table} WHERE user_id=?`)
          .get(f.customer.id).n,
        0,
      );
      assert.equal(
        f.db
          .prepare("SELECT COUNT(*) n FROM social_link_flows WHERE user_id=?")
          .get(f.customer.id).n,
        0,
      );
      assert.equal(
        f.db.prepare(`SELECT COUNT(*) n FROM ${provider}_auth_attempts`).get()
          .n,
        0,
      );
      assert.equal(
        (await client.agent.get("/api/auth/connections")).body[provider].linked,
        false,
      );
      assert.equal(
        (await otherSession.agent.get("/api/auth/connections")).status,
        401,
      );
      assert.equal(
        f.db.prepare("SELECT balance FROM users WHERE id=?").get(f.customer.id)
          .balance,
        before,
      );
      assert.equal(
        f.db.prepare("SELECT COUNT(*) n FROM ledger").get().n,
        ledger,
      );
      assert.equal((await unlink(client, provider, connectionId)).status, 409);
      attach(f, provider);
      assert.equal((await unlink(client, provider, connectionId)).status, 409);
      assert.equal(
        (await unlink(client, provider, await fingerprint(client, provider)))
          .status,
        200,
      );
      assert.equal(verifyAudit(f.db).valid, true);
      const audits = f.db
        .prepare("SELECT details FROM audit WHERE action=?")
        .all(`auth.${provider}_unlinked`);
      assert.equal(audits.length, 2);
      assert.ok(!JSON.stringify(audits).includes(PASSWORD));
    } finally {
      f.db.close();
    }
  });
  test(`${provider} cannot remove last usable login from a passwordless member; stale provider sessions cannot disconnect`, async () => {
    const f = setup();
    try {
      attach(f, provider);
      const client = await login(f.app, f.customer);
      f.db
        .prepare("UPDATE users SET has_password=0 WHERE id=?")
        .run(f.customer.id);
      const connectionId = await fingerprint(client, provider);
      assert.equal(
        (await unlink(client, provider, connectionId, undefined)).status,
        409,
      );
      const other = provider === "line" ? "google" : "line";
      attach(f, other);
      if (other === "google") f.config.google = null;
      else setSetting(f.db, "lineLoginEnabled", false);
      assert.equal(
        (await unlink(client, provider, connectionId, undefined)).status,
        409,
      );
      if (other === "google") f.config.google = googleTestOptions;
      else setSetting(f.db, "lineLoginEnabled", true);
      f.db
        .prepare("UPDATE sessions SET expires_at=? WHERE user_id=?")
        .run(new Date(Date.now() + 7 * 3600000).toISOString(), f.customer.id);
      assert.equal(
        (await unlink(client, provider, connectionId, undefined)).status,
        401,
      );
      f.db
        .prepare("UPDATE sessions SET expires_at=? WHERE user_id=?")
        .run(new Date(Date.now() + 8 * 3600000).toISOString(), f.customer.id);
      assert.equal(
        (await unlink(client, provider, connectionId, undefined)).status,
        200,
      );
      assert.equal(
        (
          await unlink(
            client,
            other,
            await fingerprint(client, other),
            undefined,
          )
        ).status,
        409,
      );
    } finally {
      f.db.close();
    }
  });
}
