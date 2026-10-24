import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  audit,
  getSettings,
  hash,
  id,
  now,
  passwordHash,
  transaction,
} from "./db.mjs";
import { fail } from "./commerce.mjs";
import { secret } from "./integrations.mjs";
import { memberProfileSchema } from "./member-management.mjs";
import { safeGoogleNext } from "./google-auth.mjs";
import { returnCallbackToBrowser } from "./auth-browser.mjs";
import { detectBrowser } from "../shared/auth-browser.mjs";
import {
  activeSocialUser,
  beginSocialLink,
  consumeSocialLink,
  finishSocialLink,
  connectionId,
} from "./social-accounts.mjs";

const opaque = () => randomBytes(32).toString("hex");
const expiry = () => new Date(Date.now() + 10 * 60000).toISOString();
export function lineConfiguration(db, config) {
  const s = getSettings(db);
  const channelId = s.lineLoginChannelId;
  const channelSecret = secret(db, "lineLoginChannelSecret", config);
  return s.lineLoginEnabled &&
    /^\d{5,20}$/.test(channelId || "") &&
    channelSecret
    ? {
        channelId,
        channelSecret,
        fingerprint: hash(channelId + ":" + channelSecret),
      }
    : null;
}
export function attachLineAuth(
  app,
  db,
  config,
  { session, authLimiter, asyncRoute },
) {
  const cookieName = "hiewly_line_flow",
    pendingName = "hiewly_line_pending";
  const cookies = {
    httpOnly: true,
    sameSite: "lax",
    secure: config.production || config.origin.startsWith("https:"),
    path: "/api/auth/line",
    maxAge: 10 * 60000,
  };
  const clear = (res, name) =>
    res.clearCookie(name, { ...cookies, maxAge: undefined });
  const sameOrigin = (req, res, next) =>
    req.get("origin") === config.origin
      ? next()
      : res
          .status(403)
          .json({ error: "กรุณาเริ่ม LINE Login จากเว็บไซต์ของร้าน" });
  const options = () => {
    const value = lineConfiguration(db, config);
    if (!value) fail(503, "LINE Login ยังไม่เปิดใช้งาน กรุณาใช้ช่องทางอื่น");
    return value;
  };
  const cleanup = () => {
    db.prepare("DELETE FROM line_auth_attempts WHERE expires_at<=?").run(now());
    db.prepare("DELETE FROM line_pending WHERE expires_at<=?").run(now());
    db.prepare("DELETE FROM social_link_flows WHERE expires_at<=?").run(now());
  };
  const pending = (req) => {
    cleanup();
    const opts = options(),
      token = req.cookies[pendingName];
    const row =
      typeof token === "string" && token.length === 64
        ? db
            .prepare(
              "SELECT * FROM line_pending WHERE cookie_hash=? AND config_hash=?",
            )
            .get(hash(token), opts.fingerprint)
        : null;
    if (!row) fail(401, "ขั้นตอน LINE หมดอายุ กรุณาเริ่ม LINE Login อีกครั้ง");
    return row;
  };
  app.get("/api/auth/line/status", (req, res) =>
    res.json({ enabled: !!lineConfiguration(db, config) }),
  );
  app.get("/api/auth/connections", (req, res) => {
    if (!req.user) return res.status(401).json({ error: "กรุณาเข้าสู่ระบบ" });
    const opts = lineConfiguration(db, config);
    const line = db
      .prepare("SELECT * FROM line_identities WHERE user_id=?")
      .get(req.user.id);
    const google = db
      .prepare("SELECT * FROM google_identities WHERE user_id=?")
      .get(req.user.id);
    res.json({
      google: {
        enabled: !!config.google,
        linked: !!google,
        connectionId: connectionId(google, "google"),
      },
      line: {
        enabled: !!opts,
        linked: !!line,
        connectionId: connectionId(line, "line"),
        displayName: line?.display_name || "",
        topupEnabled:
          !!opts &&
          getSettings(db).lineTopupEnabled &&
          getSettings(db).botEnabled,
      },
    });
  });
  app.post(
    "/api/auth/line/start",
    authLimiter,
    sameOrigin,
    asyncRoute((req, res) => {
      const opts = options();
      cleanup();
      const v = z
        .object({
          intent: z.enum(["login", "link"]).default("login"),
          password: z.string().max(128).optional(),
          next: z.string().max(500).default("/"),
          referralCode: z.string().max(40).default(""),
        })
        .strict()
        .parse(req.body);
      const state = opaque(),
        browser = opaque(),
        nonce = opaque(),
        verifier = randomBytes(48).toString("base64url");
      if (v.intent === "link")
        beginSocialLink(db, req, "line", hash(state), v.password);
      if (req.cookies[cookieName])
        db.prepare("DELETE FROM line_auth_attempts WHERE browser_hash=?").run(
          hash(req.cookies[cookieName]),
        );
      if (req.cookies[pendingName])
        db.prepare("DELETE FROM line_pending WHERE cookie_hash=?").run(
          hash(req.cookies[pendingName]),
        );
      clear(res, pendingName);
      db.prepare(
        "INSERT INTO line_auth_attempts VALUES(?,?,?,?,?,?,?,?,?,?)",
      ).run(
        hash(state),
        hash(browser),
        nonce,
        verifier,
        safeGoogleNext(v.next),
        v.referralCode,
        opts.fingerprint,
        expiry(),
        now(),
        detectBrowser(req.get("user-agent")),
      );
      res.cookie(cookieName, browser, cookies);
      const url = new URL("https://access.line.me/oauth2/v2.1/authorize");
      url.search = new URLSearchParams({
        response_type: "code",
        client_id: opts.channelId,
        redirect_uri: `${config.origin}/api/auth/line/callback`,
        state,
        nonce,
        scope: "openid profile",
        code_challenge: Buffer.from(hash(verifier), "hex").toString(
          "base64url",
        ),
        code_challenge_method: "S256",
        bot_prompt: "normal",
      }).toString();
      res.json({ url: url.href });
    }),
  );
  app.get(
    "/api/auth/line/callback",
    authLimiter,
    asyncRoute(async (req, res) => {
      res.set("Referrer-Policy", "no-referrer");
      const failed = (reason = "failed") =>
        res.redirect(303, `${config.origin}/login?line=${reason}`);
      const { state, code, error } = req.query,
        browser = req.cookies[cookieName];
      if (returnCallbackToBrowser(req, res, db, config, "line", cookieName))
        return;
      if (
        typeof state !== "string" ||
        state.length !== 64 ||
        typeof browser !== "string" ||
        browser.length !== 64
      )
        return failed();
      cleanup();
      const attempt = db
        .prepare(
          "DELETE FROM line_auth_attempts WHERE state_hash=? AND browser_hash=? AND expires_at>? RETURNING *",
        )
        .get(hash(state), hash(browser), now());
      if (!attempt) return failed();
      const link = consumeSocialLink(db, hash(state));
      const failFlow = () =>
        link
          ? res.redirect(303, `${config.origin}/account?line=link_failed`)
          : failed(error ? "cancelled" : "failed");
      clear(res, cookieName);
      if (error || typeof code !== "string" || !code || code.length > 4096)
        return failFlow();
      try {
        const opts = options();
        if (opts.fingerprint !== attempt.config_hash)
          throw new Error("CONFIG_CHANGED");
        const post = async (path, body) => {
          const response = await (config.fetch || fetch)(
            `https://api.line.me/oauth2/v2.1/${path}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams(body),
              signal: AbortSignal.timeout(12000),
            },
          );
          if (!response.ok) throw new Error("LINE_OAUTH_FAILED");
          return response.json();
        };
        const tokens = await post("token", {
          grant_type: "authorization_code",
          code,
          redirect_uri: `${config.origin}/api/auth/line/callback`,
          client_id: opts.channelId,
          client_secret: opts.channelSecret,
          code_verifier: attempt.verifier,
        });
        if (
          typeof tokens.id_token !== "string" ||
          tokens.id_token.length > 16000
        )
          throw new Error("ID_TOKEN_MISSING");
        const claims = await post("verify", {
          id_token: tokens.id_token,
          client_id: opts.channelId,
          nonce: attempt.nonce,
        });
        const seconds = Math.floor(Date.now() / 1000);
        if (
          claims.iss !== "https://access.line.me" ||
          claims.aud !== opts.channelId ||
          claims.nonce !== attempt.nonce ||
          !/^U[a-f0-9]{32}$/.test(claims.sub || "") ||
          !Number.isFinite(claims.exp) ||
          claims.exp <= seconds ||
          !Number.isFinite(claims.iat) ||
          claims.iat > seconds + 300
        )
          throw new Error("INVALID_LINE_IDENTITY");
        if (lineConfiguration(db, config)?.fingerprint !== attempt.config_hash)
          throw new Error("CONFIG_CHANGED");
        const name = String(claims.name || "LINE").slice(0, 100);
        if (link) {
          finishSocialLink(db, link, "line", claims.sub, {
            channelId: opts.channelId,
            name,
          });
          return res.redirect(303, `${config.origin}/account?line=linked`);
        }
        const identity = db
          .prepare(
            "SELECT u.* FROM line_identities l JOIN users u ON u.id=l.user_id WHERE l.subject=? AND l.channel_id=?",
          )
          .get(claims.sub, opts.channelId);
        if (identity) {
          activeSocialUser(identity);
          audit(db, identity.id, "auth.line_login", "session");
          return session(
            req,
            res,
            identity,
            identity.must_change_password
              ? "/account"
              : identity.role_id === "customer"
                ? "/"
                : safeGoogleNext(attempt.next),
          );
        }
        const token = opaque();
        db.prepare("INSERT INTO line_pending VALUES(?,?,?,?,?,?,?,?)").run(
          hash(token),
          claims.sub,
          name,
          opts.channelId,
          attempt.next,
          attempt.referral_code,
          opts.fingerprint,
          expiry(),
        );
        res.cookie(pendingName, token, cookies);
        return res.redirect(303, `${config.origin}/line/complete`);
      } catch {
        audit(db, null, "auth.line_failed", "session");
        return failFlow();
      }
    }),
  );
  app.get(
    "/api/auth/line/pending",
    asyncRoute((req, res) => {
      const p = pending(req);
      res.json({ displayName: p.display_name, referralCode: p.referral_code });
    }),
  );
  app.post(
    "/api/auth/line/complete",
    authLimiter,
    sameOrigin,
    asyncRoute((req, res) => {
      const p = pending(req);
      // LINE profile scope does not verify email ownership. Never merge by this
      // user-entered email; existing members must log in and explicitly link.
      const v = memberProfileSchema
        .extend({
          password: z.string().min(12).max(128),
          referralCode: z.string().max(40).default(p.referral_code),
        })
        .strict()
        .parse(req.body);
      let uid;
      transaction(db, () => {
        if (db.prepare("SELECT id FROM users WHERE email=?").get(v.email))
          fail(
            409,
            "อีเมลนี้มีบัญชีแล้ว กรุณาเข้าสู่ระบบเดิมแล้วเชื่อมต่อ LINE ในหน้าบัญชีของฉัน",
          );
        if (
          db
            .prepare("SELECT subject FROM line_identities WHERE subject=?")
            .get(p.subject)
        )
          fail(409, "LINE นี้เชื่อมต่อแล้ว กรุณาเริ่ม LINE Login อีกครั้ง");
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
          "INSERT INTO users(id,name,email,password,role_id,referral_code,referred_by,created_at,first_name,last_name,phone,discovery_source,line_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
        ).run(
          uid,
          `${v.firstName} ${v.lastName}`,
          v.email,
          passwordHash(v.password),
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
        db.prepare("INSERT INTO line_identities VALUES(?,?,?,?,?,?)").run(
          p.subject,
          uid,
          p.channel_id,
          p.display_name,
          id(),
          now(),
        );
        db.prepare("DELETE FROM line_pending WHERE cookie_hash=?").run(
          p.cookie_hash,
        );
        audit(db, uid, "member.line_registered", uid, { referred: !!ref });
        audit(db, uid, "auth.line_linked", uid);
      });
      clear(res, pendingName);
      session(
        req,
        res,
        db.prepare("SELECT * FROM users WHERE id=?").get(uid),
        null,
        "/",
      );
    }),
  );
}
