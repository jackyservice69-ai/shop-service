import { audit, id, now, passwordMatches, transaction } from "./db.mjs";
import { fail } from "./commerce.mjs";
import { hash, getSettings } from "./db.mjs";
import { secret } from "./integrations.mjs";
import { z } from "zod";

export function activeSocialUser(user) {
  if (
    !user?.active ||
    (user.must_change_password && user.password_reset_expires_at <= now())
  )
    fail(401, "บัญชีนี้ยังไม่พร้อมเข้าสู่ระบบ กรุณาติดต่อร้าน");
}

function verifySocialSession(req) {
  if (!req.user || !req.session)
    fail(401, "กรุณาเข้าสู่ระบบก่อนเชื่อมต่อบัญชี");
  if (!req.get("x-csrf-token") || req.get("x-csrf-token") !== req.session.csrf)
    fail(403, "กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง");
  if (req.user.must_change_password)
    fail(403, "กรุณาเปลี่ยนรหัสผ่านก่อนเชื่อมต่อบัญชี");
  activeSocialUser(req.user);
}

export function verifySocialChange(req, password = "") {
  verifySocialSession(req);
  if (req.user.has_password) {
    if (!passwordMatches(password, req.user.password))
      fail(401, "รหัสผ่านปัจจุบันไม่ถูกต้อง");
  } else if (
    Date.parse(req.session.expires_at) - Date.now() <
    (8 * 60 - 10) * 60000
  ) {
    fail(
      401,
      "กรุณาออกจากระบบแล้วเข้าสู่ระบบอีกครั้งเพื่อยืนยันก่อนเชื่อมต่อบัญชี",
    );
  }
}

export function beginSocialLink(db, req, provider, stateHash) {
  // Connecting proves provider ownership in OAuth; the signed-in session and
  // CSRF token bind that proof to this member. Disconnection still reauthenticates.
  verifySocialSession(req);
  db.prepare("DELETE FROM social_link_flows WHERE expires_at<=?").run(now());
  db.prepare("INSERT INTO social_link_flows VALUES(?,?,?,?,?)").run(
    stateHash,
    provider,
    req.user.id,
    req.session.token,
    new Date(Date.now() + 10 * 60000).toISOString(),
  );
}

export function connectionId(row, provider) {
  return row
    ? hash(
        `${provider}:${row.subject}:${provider === "line" ? row.binding_id : row.created_at}`,
      )
    : "";
}

export function attachSocialDisconnect(
  app,
  db,
  config,
  { authLimiter, asyncRoute },
) {
  app.post(
    "/api/auth/:provider/unlink",
    authLimiter,
    asyncRoute((req, res) => {
      const provider = z.enum(["google", "line"]).parse(req.params.provider);
      if (req.get("origin") !== config.origin)
        fail(403, "กรุณายกเลิกการเชื่อมต่อจากเว็บไซต์ของร้าน");
      const values = z
        .object({
          password: z.string().max(128).optional(),
          connectionId: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict()
        .parse(req.body);
      verifySocialChange(req, values.password);
      transaction(db, () => {
        const table =
          provider === "line" ? "line_identities" : "google_identities";
        const row = db
          .prepare(`SELECT * FROM ${table} WHERE user_id=?`)
          .get(req.user.id);
        if (!row || connectionId(row, provider) !== values.connectionId)
          fail(409, "การเชื่อมต่อเปลี่ยนแล้ว กรุณาโหลดข้อมูลใหม่");
        const other =
          provider === "line" ? "google_identities" : "line_identities";
        const remaining = db
          .prepare(`SELECT * FROM ${other} WHERE user_id=?`)
          .get(req.user.id);
        // A LINE identity on an old channel cannot be used to sign in now.
        const settings = getSettings(db);
        const usableOther =
          remaining &&
          (provider === "line"
            ? !!config.google
            : settings.lineLoginEnabled &&
              remaining.channel_id === settings.lineLoginChannelId &&
              !!secret(db, "lineLoginChannelSecret", config));
        if (!req.user.has_password && !usableOther)
          fail(
            409,
            "ต้องมีรหัสผ่านหรือเชื่อมต่อช่องทางเข้าสู่ระบบอื่นก่อนยกเลิกช่องทางสุดท้าย",
          );
        db.prepare(`DELETE FROM ${table} WHERE user_id=?`).run(req.user.id);
        for (const attempts of ["line_auth_attempts", "google_auth_attempts"])
          db.prepare(
            `DELETE FROM ${attempts} WHERE state_hash IN (SELECT state_hash FROM social_link_flows WHERE user_id=?)`,
          ).run(req.user.id);
        db.prepare("DELETE FROM social_link_flows WHERE user_id=?").run(
          req.user.id,
        );
        db.prepare("DELETE FROM sessions WHERE user_id=? AND token<>?").run(
          req.user.id,
          req.session.token,
        );
        db.prepare(
          "UPDATE users SET member_version=member_version+1 WHERE id=?",
        ).run(req.user.id);
        audit(db, req.user.id, `auth.${provider}_unlinked`, req.user.id);
      });
      res.json({ ok: true });
    }),
  );
}

export function consumeSocialLink(db, stateHash) {
  return db
    .prepare("DELETE FROM social_link_flows WHERE state_hash=? RETURNING *")
    .get(stateHash);
}

export function finishSocialLink(db, link, provider, subject, profile = {}) {
  return transaction(db, () => {
    // The ordinary Strict session cookie is intentionally absent on cross-site
    // OAuth returns. The browser-bound Lax flow cookie proves this callback;
    // the initiating session must still exist and belong to the same member.
    const session = db
      .prepare(
        "SELECT * FROM sessions WHERE token=? AND user_id=? AND expires_at>?",
      )
      .get(link.session_token, link.user_id, now());
    const user = db.prepare("SELECT * FROM users WHERE id=?").get(link.user_id);
    if (!session || link.provider !== provider || link.expires_at <= now())
      fail(401, "ขั้นตอนเชื่อมต่อหมดอายุ");
    activeSocialUser(user);
    if (user.must_change_password)
      fail(403, "กรุณาเปลี่ยนรหัสผ่านก่อนเชื่อมต่อบัญชี");
    const table =
      provider === "google" ? "google_identities" : "line_identities";
    const existing = db
      .prepare(`SELECT * FROM ${table} WHERE subject=? OR user_id=?`)
      .all(subject, user.id);
    if (
      existing.some((row) => row.user_id !== user.id || row.subject !== subject)
    )
      fail(
        409,
        "บัญชีผู้ให้บริการนี้เชื่อมต่อกับสมาชิกอื่นแล้ว หรือคุณเชื่อมบัญชีอื่นไว้แล้ว",
      );
    if (provider === "google") {
      db.prepare("INSERT OR IGNORE INTO google_identities VALUES(?,?,?)").run(
        subject,
        user.id,
        now(),
      );
    } else {
      db.prepare(
        "INSERT INTO line_identities VALUES(?,?,?,?,?,?) ON CONFLICT(subject) DO UPDATE SET channel_id=excluded.channel_id,display_name=excluded.display_name,binding_id=excluded.binding_id,created_at=excluded.created_at",
      ).run(subject, user.id, profile.channelId, profile.name, id(), now());
    }
    audit(db, user.id, `auth.${provider}_linked`, user.id);
    return user;
  });
}
