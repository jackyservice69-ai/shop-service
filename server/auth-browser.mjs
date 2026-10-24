import { hash, now } from "./db.mjs";
import { browserNames, validCallback } from "../shared/auth-browser.mjs";
// This only routes the callback. The original cookie/state/PKCE and initiating
// member session are still required before any identity or session is changed.
export function returnCallbackToBrowser(
  req,
  res,
  db,
  config,
  provider,
  cookieName,
) {
  if (!validCallback(provider, req.query)) return false;
  const table =
    provider === "line" ? "line_auth_attempts" : "google_auth_attempts";
  const row = db
    .prepare(
      `SELECT browser_hash,origin_browser FROM ${table} WHERE state_hash=? AND expires_at>?`,
    )
    .get(hash(req.query.state), now());
  if (
    !row ||
    (typeof req.cookies[cookieName] === "string" &&
      row.browser_hash === hash(req.cookies[cookieName]))
  )
    return false;
  if (
    !Object.hasOwn(browserNames, row.origin_browser) ||
    row.origin_browser === "same"
  )
    return false;
  // A failed attempt to return via a normal HTTPS link must not loop forever.
  if (req.query.browser_return === "1") return false;
  const fragment = new URLSearchParams({
    provider,
    state: req.query.state,
    browser: row.origin_browser,
  });
  if (
    db
      .prepare("SELECT state_hash FROM social_link_flows WHERE state_hash=?")
      .get(hash(req.query.state))
  )
    fragment.set("mode", "link");
  fragment.set(
    req.query.error ? "error" : "code",
    req.query.error || req.query.code,
  );
  res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  res.redirect(303, `${config.origin}/auth/browser-return#${fragment}`);
  return true;
}
