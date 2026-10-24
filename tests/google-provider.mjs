// Test-only provider transport. No .env, real credentials or external requests.
import { generateKeyPairSync, sign } from "node:crypto";
import { hash } from "../server/db.mjs";
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
export const googleTestOptions = {
  clientId: "test-client.apps.googleusercontent.com",
  clientSecret: "isolated-test-secret",
  redirectUri: "http://127.0.0.1:5174/api/auth/google/callback",
};
export function googleTestProvider(getDb) {
  let calls = 0;
  const codes = new Map();
  return {
    get calls() {
      return calls;
    },
    code(state, claims = {}, mode = "valid") {
      const code = crypto.randomUUID();
      codes.set(code, { state, claims, mode });
      return code;
    },
    async request(options) {
      const url = String(options.url);
      if (url === "https://oauth2.googleapis.com/token") {
        calls++;
        const c = codes.get(options.data.get("code"));
        codes.delete(options.data.get("code"));
        if (!c || c.mode === "offline")
          throw new Error("Simulated provider failure");
        // Callback consumes the DB attempt before exchange. Tests pass the nonce
        // explicitly, while PKCE verifier must still be supplied to the provider.
        if (!options.data.get("code_verifier")) throw new Error("PKCE missing");
        const seconds = Math.floor(Date.now() / 1000);
        const claims = {
          iss: "https://accounts.google.com",
          aud: googleTestOptions.clientId,
          iat: seconds,
          exp: seconds + 3600,
          sub: "google-test-subject",
          email: "google@test.example",
          email_verified: true,
          given_name: "กูเกิล",
          family_name: "ทดสอบ",
          ...c.claims,
        };
        const head = Buffer.from(
          JSON.stringify({ alg: "RS256", typ: "JWT", kid: "test-key" }),
        ).toString("base64url");
        const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
        const signed = head + "." + body;
        let signature = sign(
          "RSA-SHA256",
          Buffer.from(signed),
          keys.privateKey,
        ).toString("base64url");
        if (c.mode === "bad-signature") signature = "invalid";
        return {
          data: {
            id_token: signed + "." + signature,
            access_token: "test-access-never-store",
            expires_in: 3600,
          },
          headers: new Headers(),
        };
      }
      if (url === "https://www.googleapis.com/oauth2/v1/certs")
        return {
          data: {
            "test-key": keys.publicKey.export({ type: "spki", format: "pem" }),
          },
          headers: new Headers({ "cache-control": "max-age=3600" }),
        };
      throw new Error("External network forbidden in Google tests");
    },
    claims(state, extra = {}) {
      const attempt = getDb()
        .prepare("SELECT * FROM google_auth_attempts WHERE state_hash=?")
        .get(hash(state));
      return { nonce: attempt.nonce, ...extra };
    },
  };
}
