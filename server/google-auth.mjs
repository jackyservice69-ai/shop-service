import { OAuth2Client } from "google-auth-library";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  audit,
  hash,
  id,
  now,
  passwordHash,
  passwordMatches,
  transaction,
} from "./db.mjs";
import { fail } from "./commerce.mjs";
import { memberProfileSchema } from "./member-management.mjs";
import { returnCallbackToBrowser } from "./auth-browser.mjs";
import { detectBrowser } from "../shared/auth-browser.mjs";
import {
  beginSocialLink,
  consumeSocialLink,
  finishSocialLink,
} from "./social-accounts.mjs";

const opaque = () => randomBytes(32).toString("base64url");
const expires = () => new Date(Date.now() + 10 * 60000).toISOString();
const cookieName = "hiewly_google_flow",
  pendingName = "hiewly_google_pending";
export function safeGoogleNext(value) {
  return typeof value === "string" &&
    value.length <= 500 &&
    /^\/(?!\/)/.test(value) &&
    !/[\\\r\n\u0000-\u001f]/.test(value) &&
    !/^\/(?:login|register|google|line)(?:[/?#]|$)/.test(value)
    ? value
    : "/";
}
export function attachGoogleAuth(
  app,
  db,
  config,
  { session, authLimiter, asyncRoute },
) {
  const options = config.google;
  const client = options
    ? new OAuth2Client({
        ...options,
        transporterOptions: { timeout: 12000, retry: false },
      })
    : null;
  // Transport injection exists only in the isolated test fixture. All token validation
  // still runs through Google's real library and signed JWT verification.
  if (client && config.googleTransport)
    client.transporter = config.googleTransport;
  const cookies = {
    httpOnly: true,
    sameSite: "lax",
    secure: config.production || config.origin.startsWith("https:"),
    path: "/api/auth/google",
    maxAge: 10 * 60000,
  };
  const clear = (res, name) =>
    res.clearCookie(name, { ...cookies, maxAge: undefined });
  const cleanup = () => {
    db.prepare("DELETE FROM google_auth_attempts WHERE expires_at<=?").run(
      now(),
    );
    db.prepare("DELETE FROM google_pending WHERE expires_at<=?").run(now());
  };
  const enabled = () => {
    if (!client)
      fail(503, "ยังไม่ได้เปิดใช้งาน Google Login กรุณาใช้อีเมลและรหัสผ่าน");
  };
  const sameOrigin = (req, res, next) =>
    req.get("origin") === config.origin
      ? next()
      : res
          .status(403)
          .json({ error: "กรุณาเริ่ม Google Login จากเว็บไซต์ของร้าน" });
  const pending = (req) => {
    cleanup();
    const token = req.cookies[pendingName];
    const p =
      typeof token === "string" && token.length === 43
        ? db
            .prepare("SELECT * FROM google_pending WHERE cookie_hash=?")
            .get(hash(token))
        : null;
    if (!p || p.attempts >= 5)
      fail(
        401,
        "ขั้นตอน Google หมดอายุ กรุณาเริ่มเข้าสู่ระบบด้วย Google อีกครั้ง",
      );
    return p;
  };
  const destination = (user, next) =>
    user.must_change_password
      ? "/account"
      : user.role_id === "customer"
        ? "/"
        : safeGoogleNext(next);
  const active = (user) => {
    if (
      !user?.active ||
      (user.must_change_password && user.password_reset_expires_at <= now())
    )
      fail(401, "บัญชีนี้ยังไม่พร้อมเข้าสู่ระบบ กรุณาติดต่อร้าน");
  };
  app.get("/api/auth/google/status", (req, res) =>
    res.json({ enabled: !!client }),
  );
  app.post(
    "/api/auth/google/start",
    authLimiter,
    sameOrigin,
    asyncRoute(async (req, res) => {
      enabled();
      cleanup();
      const v = z
        .object({
          next: z.string().max(500).default("/"),
          referralCode: z.string().max(40).default(""),
          intent: z.enum(["login", "link"]).default("login"),
          password: z.string().max(128).optional(),
        })
        .strict()
        .parse(req.body);
      const browser = opaque(),
        state = opaque(),
        nonce = opaque();
      const { codeVerifier, codeChallenge } =
        await client.generateCodeVerifierAsync();
      if (req.cookies[cookieName])
        db.prepare("DELETE FROM google_auth_attempts WHERE browser_hash=?").run(
          hash(req.cookies[cookieName]),
        );
      if (req.cookies[pendingName])
        db.prepare("DELETE FROM google_pending WHERE cookie_hash=?").run(
          hash(req.cookies[pendingName]),
        );
      clear(res, pendingName);
      if (v.intent === "link")
        beginSocialLink(db, req, "google", hash(state), v.password);
      db.prepare(
        "INSERT INTO google_auth_attempts VALUES(?,?,?,?,?,?,?,?,?)",
      ).run(
        hash(state),
        hash(browser),
        nonce,
        codeVerifier,
        safeGoogleNext(v.next),
        v.referralCode,
        expires(),
        now(),
        detectBrowser(req.get("user-agent")),
      );
      res.cookie(cookieName, browser, cookies);
      res.json({
        url: client.generateAuthUrl({
          scope: ["openid", "email", "profile"],
          state,
          nonce,
          code_challenge: codeChallenge,
          code_challenge_method: "S256",
          prompt: "select_account",
        }),
      });
    }),
  );
  app.get(
    "/api/auth/google/callback",
    authLimiter,
    asyncRoute(async (req, res) => {
      res.set("Referrer-Policy", "no-referrer");
      const failed = (reason = "failed") =>
        res.redirect(303, `${config.origin}/login?google=${reason}`);
      if (!client) return failed();
      cleanup();
      const { state, code, error } = req.query,
        browser = req.cookies[cookieName];
      if (returnCallbackToBrowser(req, res, db, config, "google", cookieName))
        return;
      if (
        typeof state !== "string" ||
        state.length !== 43 ||
        typeof browser !== "string" ||
        browser.length !== 43
      )
        return failed();
      const attempt = db
        .prepare(
          "DELETE FROM google_auth_attempts WHERE state_hash=? AND browser_hash=? AND expires_at>? RETURNING *",
        )
        .get(hash(state), hash(browser), now());
      if (!attempt) return failed();
      const link = consumeSocialLink(db, hash(state));
      const linkFailed = () =>
        res.redirect(303, `${config.origin}/account?google=link_failed`);
      clear(res, cookieName);
      if (error) return link ? linkFailed() : failed("cancelled");
      if (typeof code !== "string" || !code || code.length > 4096)
        return failed();
      try {
        const { tokens } = await client.getToken({
          code,
          codeVerifier: attempt.verifier,
        });
        const ticket = await client.verifyIdToken({
          idToken: tokens.id_token,
          audience: options.clientId,
        });
        const p = ticket.getPayload();
        if (
          !p ||
          p.nonce !== attempt.nonce ||
          p.email_verified !== true ||
          typeof p.sub !== "string" ||
          !p.sub ||
          p.sub.length > 255 ||
          !z.email().max(200).safeParse(p.email).success
        )
          throw new Error("Invalid Google identity");
        if (link) {
          finishSocialLink(db, link, "google", p.sub);
          return res.redirect(303, `${config.origin}/account?google=linked`);
        }
        const identity = db
          .prepare(
            "SELECT u.* FROM google_identities g JOIN users u ON u.id=g.user_id WHERE g.subject=?",
          )
          .get(p.sub);
        if (identity) {
          active(identity);
          audit(db, identity.id, "auth.google_login", "session");
          return session(
            req,
            res,
            identity,
            destination(identity, attempt.next),
          );
        }
        const token = opaque();
        db.prepare(
          "INSERT INTO google_pending VALUES(?,?,?,?,?,?,?,?,?,0)",
        ).run(
          hash(token),
          p.sub,
          p.email.toLowerCase(),
          String(p.given_name || "").slice(0, 80),
          String(p.family_name || "").slice(0, 80),
          attempt.next,
          attempt.referral_code,
          expires(),
          now(),
        );
        res.cookie(pendingName, token, cookies);
        return res.redirect(303, `${config.origin}/google/complete`);
      } catch {
        // Never log OAuth codes, token responses, provider errors or credentials.
        audit(db, null, "auth.google_failed", "session");
        return link ? linkFailed() : failed();
      }
    }),
  );
  app.get("/api/auth/google/pending", (req, res, next) => {
    try {
      enabled();
      const p = pending(req);
      const user = db
        .prepare("SELECT id FROM users WHERE email=?")
        .get(p.email);
      res.json({
        email: p.email,
        firstName: p.first_name,
        lastName: p.last_name,
        existingAccount: !!user,
        referralCode: p.referral_code,
      });
    } catch (e) {
      next(e);
    }
  });
  app.post(
    "/api/auth/google/complete",
    authLimiter,
    sameOrigin,
    asyncRoute((req, res) => {
      enabled();
      const p = pending(req);
      const action = z.enum(["register", "link"]).parse(req.body?.action);
      let uid;
      transaction(db, () => {
        if (action === "link") {
          const v = z
            .object({
              action: z.literal("link"),
              password: z.string().min(1).max(128),
            })
            .strict()
            .parse(req.body);
          const user = db
            .prepare("SELECT * FROM users WHERE email=?")
            .get(p.email);
          if (!user)
            fail(409, "บัญชีเปลี่ยนแปลงแล้ว กรุณาเริ่ม Google Login อีกครั้ง");
          const valid = passwordMatches(v.password, user.password);
          if (!valid || !user.has_password) {
            // Commit failed-attempt accounting outside the rollback below.
            fail(401, "รหัสผ่านบัญชีเดิมไม่ถูกต้อง");
          }
          active(user);
          if (user.must_change_password)
            fail(
              409,
              "กรุณาเข้าสู่ระบบด้วยรหัสผ่านชั่วคราวและตั้งรหัสใหม่ก่อนเชื่อม Google",
            );
          uid = user.id;
        } else {
          const v = memberProfileSchema
            .omit({ email: true })
            .extend({
              action: z.literal("register"),
              referralCode: z.string().max(40).default(p.referral_code),
            })
            .strict()
            .parse(req.body);
          if (db.prepare("SELECT id FROM users WHERE email=?").get(p.email))
            fail(
              409,
              "อีเมลนี้มีบัญชีแล้ว กรุณาเริ่ม Google Login และยืนยันรหัสผ่านเดิม",
            );
          const ref = v.referralCode
            ? db
                .prepare(
                  "SELECT id FROM users WHERE referral_code=? AND active=1",
                )
                .get(v.referralCode)
            : null;
          if (v.referralCode && !ref) fail(400, "รหัสแนะนำไม่ถูกต้อง");
          uid = id();
          db.prepare(
            "INSERT INTO users(id,name,email,password,role_id,referral_code,referred_by,created_at,first_name,last_name,phone,discovery_source,line_id,has_password) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,0)",
          ).run(
            uid,
            v.firstName + " " + v.lastName,
            p.email,
            passwordHash(opaque()),
            "customer",
            id().slice(0, 10),
            ref?.id || null,
            now(),
            v.firstName,
            v.lastName,
            v.phone,
            v.discoverySource,
            v.lineId,
          );
          audit(db, uid, "member.google_registered", uid, { referred: !!ref });
        }
        db.prepare("INSERT INTO google_identities VALUES(?,?,?)").run(
          p.subject,
          uid,
          now(),
        );
        db.prepare("DELETE FROM google_pending WHERE cookie_hash=?").run(
          p.cookie_hash,
        );
        audit(db, uid, "auth.google_linked", uid);
      });
      clear(res, pendingName);
      const user = db.prepare("SELECT * FROM users WHERE id=?").get(uid);
      session(req, res, user, null, destination(user, p.next));
    }),
  );
  // Record incorrect linking passwords after the route's transaction rolled back.
  app.use("/api/auth/google/complete", (err, req, res, next) => {
    if (err.status === 401 && req.cookies[pendingName]) {
      db.prepare(
        "UPDATE google_pending SET attempts=attempts+1 WHERE cookie_hash=?",
      ).run(hash(req.cookies[pendingName]));
      audit(db, null, "auth.google_link_failed", "session");
    }
    next(err);
  });
}
