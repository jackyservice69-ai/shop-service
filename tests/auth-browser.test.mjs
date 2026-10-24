import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { fixture, login, PASSWORD } from "./helpers.mjs";
import { hash, setSetting } from "../server/db.mjs";
import { googleTestOptions, googleTestProvider } from "./google-provider.mjs";
import { LINE_CHANNEL, lineTestProvider } from "./line-provider.mjs";
import {
  detectBrowser,
  browserReturnUrl,
  validCallback,
} from "../shared/auth-browser.mjs";

const origin = "http://127.0.0.1:5174";
const chrome =
  "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/142.0.0.0 Mobile Safari/537.36";
const samsung = chrome + " SamsungBrowser/29.0";
const safari =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";

test("detect original browsers and constrain return destinations", () => {
  assert.equal(detectBrowser(chrome), "chrome-android");
  assert.equal(detectBrowser(samsung), "samsung");
  assert.equal(detectBrowser(safari), "safari");
  assert.equal(detectBrowser(safari + " CriOS/142.0"), "chrome-ios");
  assert.equal(detectBrowser(chrome + " Line/15.0"), "same");
  const target = origin + "/api/auth/line/callback?state=test",
    fallback = origin + "/auth/browser-return";
  assert.match(
    browserReturnUrl(target, fallback, "chrome-android"),
    /package=com.android.chrome;/,
  );
  assert.match(
    browserReturnUrl(target, fallback, "samsung"),
    /package=com.sec.android.app.sbrowser;/,
  );
  assert.match(
    browserReturnUrl(target, fallback, "chrome-ios"),
    /^googlechrome:/,
  );
  assert.equal(browserReturnUrl(target, fallback, "safari"), target);
  for (const bad of [
    "javascript:alert(1)",
    origin + "/#Intent;package=evil",
    "https://user:pass@evil.example",
  ])
    assert.throws(() => browserReturnUrl(bad, fallback, "samsung"));
  assert.throws(() =>
    browserReturnUrl(target, "https://evil.example", "chrome-android"),
  );
  assert.throws(() => browserReturnUrl(target, fallback, "evil"));
  assert.equal(
    validCallback("line", { state: "a".repeat(64), code: ["a"] }),
    false,
  );
  assert.equal(
    validCallback("line", { state: "a".repeat(64), code: "x".repeat(4097) }),
    false,
  );
});

for (const provider of ["line", "google"])
  for (const [startUa, expectedBrowser] of [
    [chrome, "chrome-android"],
    [samsung, "samsung"],
    [safari, "safari"],
    [safari + " CriOS/142.0", "chrome-ios"],
  ]) {
    test(`${provider}: ${expectedBrowser}: wrong mobile browser returns to origin without consuming proof or linking; original browser finishes once`, async () => {
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
      try {
        const client = await login(f.app, f.customer);
        const start = await client.agent
          .post(`/api/auth/${provider}/start`)
          .set("Origin", origin)
          .set("x-csrf-token", client.csrf)
          .set("User-Agent", startUa)
          .send({ intent: "link", password: PASSWORD });
        assert.equal(start.status, 200);
        const state = new URL(start.body.url).searchParams.get("state");
        const code =
          provider === "line"
            ? line.code(state)
            : google.code(state, google.claims(state));
        const table = `${provider}_auth_attempts`;
        const callback = `/api/auth/${provider}/callback`;
        for (const userAgent of [samsung, safari]) {
          const other = await request(f.app)
            .get(callback)
            .set("User-Agent", userAgent)
            .query({ state, code, redirect_uri: "https://evil.example" });
          assert.equal(other.status, 303);
          const location = new URL(other.headers.location);
          assert.equal(location.origin, origin);
          assert.equal(location.pathname, "/auth/browser-return");
          const fragment = new URLSearchParams(location.hash.slice(1));
          assert.equal(fragment.get("provider"), provider);
          assert.equal(fragment.get("browser"), expectedBrowser);
          assert.equal(fragment.get("code"), code);
          assert.equal(fragment.has("redirect_uri"), false);
          assert.equal(other.headers["cache-control"], "no-store");
          assert.equal(other.headers["referrer-policy"], "no-referrer");
          assert.equal(
            f.db
              .prepare(`SELECT COUNT(*) n FROM ${table} WHERE state_hash=?`)
              .get(hash(state)).n,
            1,
          );
          assert.equal(
            f.db
              .prepare(
                `SELECT COUNT(*) n FROM ${provider}_identities WHERE user_id=?`,
              )
              .get(f.customer.id).n,
            0,
          );
          assert.equal(
            f.db
              .prepare(
                "SELECT COUNT(*) n FROM social_link_flows WHERE state_hash=?",
              )
              .get(hash(state)).n,
            1,
          );
        }
        const missingChromeCookie = await request(f.app)
          .get(callback)
          .set("User-Agent", chrome)
          .query({ state, code, browser_return: "1" });
        assert.match(
          missingChromeCookie.headers.location,
          new RegExp(`/login\\?${provider}=failed$`),
        );
        for (const query of [
          { state: "z".repeat(64), code },
          { state, code: ["a", "b"] },
          { state, code: "x".repeat(4097) },
        ]) {
          const bad = await request(f.app)
            .get(callback)
            .set("User-Agent", samsung)
            .query(query);
          assert.match(
            bad.headers.location,
            new RegExp(`/login\\?${provider}=failed$`),
          );
        }
        const done = await client.agent
          .get(callback)
          .set("User-Agent", chrome)
          .query({ state, code });
        assert.equal(
          done.headers.location,
          `${origin}/account?${provider}=linked`,
        );
        assert.equal(
          f.db
            .prepare(
              `SELECT COUNT(*) n FROM ${provider}_identities WHERE user_id=?`,
            )
            .get(f.customer.id).n,
          1,
        );
        const replay = await request(f.app)
          .get(callback)
          .set("User-Agent", samsung)
          .query({ state, code });
        assert.match(
          replay.headers.location,
          new RegExp(`/login\\?${provider}=failed$`),
        );
        const second = await client.agent
          .post(`/api/auth/${provider}/start`)
          .set("Origin", origin)
          .set("x-csrf-token", client.csrf)
          .send({ intent: "link", password: PASSWORD });
        const expiredState = new URL(second.body.url).searchParams.get("state");
        f.db
          .prepare(`UPDATE ${table} SET expires_at=? WHERE state_hash=?`)
          .run("2000-01-01T00:00:00.000Z", hash(expiredState));
        const expired = await request(f.app)
          .get(callback)
          .set("User-Agent", samsung)
          .query({ state: expiredState, code: "expired" });
        assert.match(
          expired.headers.location,
          new RegExp(`/login\\?${provider}=failed$`),
        );
      } finally {
        f.db.close();
      }
    });
  }
