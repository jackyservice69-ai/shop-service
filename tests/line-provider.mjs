import assert from "node:assert/strict";
import { hash } from "../server/db.mjs";
export const LINE_ID = "U" + "1".repeat(32),
  LINE_OTHER = "U" + "2".repeat(32);
export const LINE_CHANNEL = "1234567890";
export function lineTestProvider(getDb) {
  const codes = new Map(),
    tokens = new Map();
  const calls = [];
  return {
    calls,
    code(state, extra = {}, mode = "valid") {
      const attempt = getDb()
        .prepare("SELECT * FROM line_auth_attempts WHERE state_hash=?")
        .get(hash(state));
      const code = crypto.randomUUID(),
        token = crypto.randomUUID();
      codes.set(code, { attempt, token, mode });
      tokens.set(token, {
        iss: "https://access.line.me",
        aud: LINE_CHANNEL,
        sub: LINE_ID,
        name: "สมาชิก LINE",
        nonce: attempt.nonce,
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        ...extra,
      });
      return code;
    },
    async fetch(url, options) {
      calls.push(String(url));
      if (String(url).endsWith("/oauth2/v2.1/token")) {
        const code = codes.get(options.body.get("code"));
        codes.delete(options.body.get("code"));
        if (!code || code.mode === "offline")
          throw new Error("ISOLATED_LINE_UNAVAILABLE");
        assert.equal(options.body.get("client_id"), LINE_CHANNEL);
        assert.equal(
          options.body.get("client_secret"),
          "isolated-line-login-secret",
        );
        assert.equal(options.body.get("code_verifier"), code.attempt.verifier);
        return Response.json({
          id_token: code.token,
          access_token: "never-store-access-token",
        });
      }
      if (String(url).endsWith("/oauth2/v2.1/verify")) {
        const claims = tokens.get(options.body.get("id_token"));
        if (!claims) return Response.json({}, { status: 400 });
        assert.equal(options.body.get("client_id"), LINE_CHANNEL);
        return Response.json(claims);
      }
      throw new Error("External network forbidden in LINE tests");
    },
  };
}
