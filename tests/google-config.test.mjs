import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { googleConfiguration } from "../server/google-config.mjs";

test("cloud Google credentials use server env without a file and reject partial credentials", () => {
  const env = {
    GOOGLE_CLIENT_ID: "cloud-test.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "private-cloud-test",
    GOOGLE_CREDENTIALS_FILE: "/missing/credentials.json",
  };
  assert.deepEqual(googleConfiguration("https://iyawarin.com", env), {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: "https://iyawarin.com/api/auth/google/callback",
  });
  for (const partial of [
    { GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID },
    { GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET },
  ])
    assert.throws(
      () => googleConfiguration("https://iyawarin.com", partial),
      /web client/,
    );
  assert.throws(
    () =>
      googleConfiguration("https://iyawarin.com", {
        ...env,
        GOOGLE_REDIRECT_URI: "https://evil.test/api/auth/google/callback",
      }),
    /must match/,
  );
});
test("server-only Google web credentials require valid HTTPS/local origin and exact registered callback, without reflecting secrets in errors", () => {
  const dir = mkdtempSync(join(tmpdir(), "hiewly-google-")),
    path = join(dir, "credentials.json");
  const secret = "test-private-secret-never-public";
  const env = { GOOGLE_CREDENTIALS_FILE: path };
  try {
    assert.throws(
      () => googleConfiguration("https://app.example", env),
      /not found/,
    );
    writeFileSync(
      path,
      JSON.stringify({
        installed: {
          client_id: "test.apps.googleusercontent.com",
          client_secret: secret,
        },
      }),
    );
    assert.throws(
      () => googleConfiguration("https://app.example", env),
      /web client/,
    );
    writeFileSync(
      path,
      JSON.stringify({
        web: {
          client_id: "test.apps.googleusercontent.com",
          client_secret: secret,
          redirect_uris: [],
        },
      }),
    );
    const config = googleConfiguration("https://app.example", env);
    assert.equal(
      config.redirectUri,
      "https://app.example/api/auth/google/callback",
    );
    assert.equal(config.clientSecret, secret);
    for (const origin of ["http://public.example", "ftp://localhost"])
      assert.throws(() => googleConfiguration(origin, env), /HTTPS/);
    for (const uri of [
      "https://evil.test/api/auth/google/callback",
      "https://app.example/wrong",
      "https://app.example/api/auth/google/callback?next=evil",
    ])
      assert.throws(
        () =>
          googleConfiguration("https://app.example", {
            ...env,
            GOOGLE_REDIRECT_URI: uri,
          }),
        /must match/,
      );
    assert.equal(
      googleConfiguration("http://localhost:5174", env).redirectUri,
      "http://localhost:5174/api/auth/google/callback",
    );
    writeFileSync(path, "{not-json: " + secret);
    assert.throws(
      () => googleConfiguration("https://app.example", env),
      (e) => !e.message.includes(secret),
    );
  } finally {
    rmSync(path, { force: true });
    rmdirSync(dir);
  }
});
