import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// The downloaded web-client JSON stays outside public/ and dist/.
export function googleConfiguration(origin, env = process.env) {
  let web;
  if (env.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_SECRET) {
    web = {
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
    };
  } else {
    const path = resolve(
      env.GOOGLE_CREDENTIALS_FILE || "./.secrets/google-oauth.json",
    );
    if (!existsSync(path)) {
      if (env.GOOGLE_CREDENTIALS_FILE)
        throw new Error("Google credentials file was not found");
      return null;
    }
    try {
      web = JSON.parse(readFileSync(path, "utf8")).web;
    } catch {
      throw new Error("Google credentials must be valid web-client JSON");
    }
  }
  if (
    !web ||
    typeof web.client_id !== "string" ||
    !web.client_id.endsWith(".apps.googleusercontent.com") ||
    typeof web.client_secret !== "string" ||
    !web.client_secret
  )
    throw new Error(
      "Google credentials must contain a web client ID and secret",
    );
  const base = new URL(origin);
  if (
    base.protocol !== "https:" &&
    !(
      base.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)
    )
  )
    throw new Error("Google Login requires HTTPS, except on localhost");
  const redirectUri =
    env.GOOGLE_REDIRECT_URI || `${base.origin}/api/auth/google/callback`;
  const redirect = new URL(redirectUri);
  if (
    redirect.origin !== base.origin ||
    redirect.pathname !== "/api/auth/google/callback" ||
    redirect.search ||
    redirect.hash ||
    redirect.username ||
    redirect.password
  )
    throw new Error(
      "Google redirect URI must match APP_ORIGIN/api/auth/google/callback",
    );
  return {
    clientId: web.client_id,
    clientSecret: web.client_secret,
    redirectUri,
  };
}
