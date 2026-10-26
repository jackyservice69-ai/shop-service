import {
  productImageUrl,
  productDto,
  prepareProductImages,
} from "./product-images.mjs";
import {
  attachExperience,
  publicExperience,
  checkMedia,
  receivingAccountKey,
  currentPaymentQr,
} from "./experience.mjs";
import express from "express";
import { attachGoogleAuth } from "./google-auth.mjs";
import { attachSocialDisconnect } from "./social-accounts.mjs";
import { attachLineAuth, lineConfiguration } from "./line-auth.mjs";
import { getBankCard } from "./line-bank-card.mjs";
import { attachAdminWallet } from "./admin-wallet.mjs";
import { attachAddresses } from "./addresses.mjs";
import { attachConsignments } from "./consignments.mjs";
import { attachWithdrawals } from "./withdrawals.mjs";
import { attachProfileMedia, publicProductShops } from "./profile-media.mjs";
import { attachPublicShops, findPublicShop } from "./public-shops.mjs";
import {
  attachNotifications,
  notifyProductRequest,
  notifyProductDecision,
  resolveApprovalNotices,
} from "./notifications.mjs";
import { settleConsignments } from "./consignment-ledger.mjs";
import { attachReviews } from "./reviews.mjs";
import {
  attachMemberManagement,
  memberProfileSchema,
} from "./member-management.mjs";
import { verifyPaymentQr } from "./payment-qr.mjs";
import socialPlatforms from "../shared/socials.json" with { type: "json" };
import { attachMerchantAccounts } from "./merchant-accounts.mjs";
import { merchantAccounts, bankFields } from "./merchant-account-policy.mjs";
import passwordPolicy from "../shared/password-policy.json" with { type: "json" };
import {
  catalog as authorization,
  hasPermission,
} from "../shared/authorization.mjs";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  id,
  hash,
  now,
  passwordHash,
  passwordMatches,
  transaction,
  audit,
  verifyAudit,
  getSettings,
  setSetting,
  encrypt,
} from "./db.mjs";
import {
  fail,
  money,
  cartSchema,
  checkoutSchema,
  quote,
  createOrder,
  payOrder,
  cancelOrder,
  settleCommission,
  creditTopup,
} from "./commerce.mjs";
import {
  SECRET_KEYS,
  secret,
  easySlip,
  easyRequest,
  lineSignature,
  queueWebhook,
} from "./integrations.mjs";

export const PERMISSIONS = authorization.permissions.map((p) => p.id);
const assignablePermissions = authorization.permissions.filter(
  (p) => !p.ownerOnly,
);
const roleSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    permissions: z
      .array(z.enum(assignablePermissions.map((p) => p.id)))
      .max(assignablePermissions.length),
  })
  .strict()
  .superRefine((v, ctx) => {
    for (const p of assignablePermissions.filter((p) =>
      v.permissions.includes(p.id),
    ))
      for (const needed of p.requires)
        if (!v.permissions.includes(needed))
          ctx.addIssue({
            code: "custom",
            path: ["permissions"],
            message: `${p.label} ต้องมีสิทธิ์ ${assignablePermissions.find((r) => r.id === needed).label} ด้วย`,
          });
  });
const asyncRoute = (fn) => (req, res, next) =>
  Promise.resolve()
    .then(() => fn(req, res, next))
    .catch(next);
const parse = (schema, body) => schema.parse(body);
const safeUser = (u) =>
  u
    ? {
        id: u.id,
        name: u.name,
        firstName: u.first_name,
        lastName: u.last_name,
        phone: u.phone,
        discoverySource: u.discovery_source,
        lineId: u.line_id,
        avatar: u.avatar,
        avatarVersion: u.avatar_version,
        email: u.email,
        roleId: u.role_id,
        roleName: u.role_name,
        permissions: JSON.parse(u.permissions),
        balance: u.balance,
        referralCode: u.referral_code,
        createdAt: u.created_at,
        mustChangePassword: !!u.must_change_password,
        hasPassword: !!u.has_password,
      }
    : null;
const keyOf = (req) =>
  parse(
    z.string().regex(/^[A-Za-z0-9_-]{16,80}$/, "รหัสคำขอไม่ถูกต้อง"),
    req.get("Idempotency-Key"),
  );
const paging = (req) => ({
  page: Math.max(1, Math.min(Number(req.query.page) || 1, 100000)),
  size: Math.max(1, Math.min(Number(req.query.size) || 12, 50)),
  q: String(req.query.q || "").slice(0, 100),
});
const publicQuote = (q) => ({
  ...q,
  items: q.items.map(({ cost, ...item }) => item),
});
function pageRows(db, sql, params, req) {
  const { page, size } = paging(req);
  const total = db.prepare(`SELECT COUNT(*) n FROM (${sql})`).get(...params).n;
  const clampedPage = Math.min(page, Math.max(1, Math.ceil(total / size)));
  return {
    items: db
      .prepare(`${sql} LIMIT ? OFFSET ?`)
      .all(...params, size, (clampedPage - 1) * size),
    total,
    page: clampedPage,
    size,
  };
}
function productPage(result, db) {
  const items = result.items.map(productDto);
  return { ...result, items: db ? publicProductShops(db, items) : items };
}
const boundedText = z.string().trim().min(1).max(200);
const productSchema = z.object({
  name: boundedText,
  description: z.string().trim().max(2000),
  category: boundedText,
  price: money.refine((v) => v > 0),
  cost: money.default(0),
  stock: z.number().int().min(0).max(100000),
  image: z
    .string()
    .max(1500)
    .refine(
      (v) =>
        v.startsWith("/assets/") ||
        /^\/api\/media\/[a-f0-9]{32}$/.test(v) ||
        /^https:\/\//.test(v),
      "รูปภาพต้องเป็น HTTPS หรือ /assets/",
    ),
  images: z
    .array(productImageUrl)
    .min(1)
    .max(8)
    .refine((v) => new Set(v).size === v.length, "รูปภาพซ้ำ")
    .optional(),
  active: z.boolean(),
  version: z.number().int().optional(),
});
const promoSchema = z
  .object({
    title: z.string().trim().max(200).default(""),
    description: z.string().trim().max(2000).default(""),
    image: z.string().max(100).default(""),
    claim_required: z.boolean().default(false),
    code: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{2,40}$/)
      .transform((v) => v.toUpperCase()),
    type: z.enum(["percent", "fixed"]),
    value: money.refine((v) => v > 0),
    minimum: money,
    limit_count: z.number().int().min(1).max(1000000),
    per_user: z.number().int().min(1).max(1000),
    starts_at: z.iso.datetime(),
    ends_at: z.iso.datetime(),
    active: z.boolean(),
    version: z.number().int().optional(),
  })
  .refine((v) => v.ends_at > v.starts_at, "วันสิ้นสุดต้องหลังวันเริ่ม")
  .refine(
    (v) => v.type !== "percent" || v.value <= 100,
    "เปอร์เซ็นต์ต้องไม่เกิน 100",
  );
const announcementSchema = z
  .object({
    title: boundedText,
    image: z.string().max(100).default(""),
    position: z.number().int().min(0).max(1000).default(0),
    body: z.string().trim().min(1).max(3000),
    active: z.boolean(),
    starts_at: z.iso.datetime(),
    ends_at: z.iso.datetime(),
    version: z.number().int().optional(),
  })
  .refine((v) => v.ends_at > v.starts_at, "วันสิ้นสุดต้องหลังวันเริ่ม");

export function createApp(db, config) {
  const app = express();
  if (config.trustProxy) app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(
    helmet({
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            "https://fonts.googleapis.com",
          ],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          upgradeInsecureRequests: config.production ? [] : null,
        },
      },
      strictTransportSecurity: config.production ? undefined : false,
    }),
  );
  app.post(
    "/api/line/webhook",
    rateLimit({ windowMs: 60000, limit: 120 }),
    express.raw({ type: "application/json", limit: "128kb" }),
    asyncRoute((req, res) => {
      const s = getSettings(db);
      if (
        !lineSignature(
          req.body,
          req.get("x-line-signature"),
          secret(db, "lineChannelSecret", config),
        )
      )
        fail(401, "ลายเซ็น LINE ไม่ถูกต้อง");
      if (!s.botEnabled) return res.json({ ok: true, disabled: true });
      const body = JSON.parse(req.body.toString("utf8"));
      if (!Array.isArray(body.events)) fail(400, "รูปแบบ webhook ไม่ถูกต้อง");
      queueWebhook(db, body);
      res.json({ ok: true });
    }),
  );
  app.use(express.json({ limit: "64kb" }), cookieParser());
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      // Functional browser suites share one loopback IP; production always keeps 300/min.
      limit: config.production ? 300 : (config.apiRateLimit ?? 300),
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "คำขอมากเกินไป กรุณารอสักครู่" },
    }),
  );
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.get("origin") &&
      req.get("origin") !== config.origin
    )
      return res.status(403).json({ error: "Origin ไม่ได้รับอนุญาต" });
    next();
  });
  app.use("/api", (req, res, next) => {
    const token = req.cookies.hiewly_session;
    if (token) {
      const s = db
        .prepare("SELECT * FROM sessions WHERE token=? AND expires_at>?")
        .get(hash(token), now());
      if (s) {
        req.session = s;
        req.user = db
          .prepare(
            "SELECT u.*,r.name role_name,r.permissions FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=? AND active=1",
          )
          .get(s.user_id);
        if (
          req.user?.must_change_password &&
          req.user.password_reset_expires_at <= now()
        ) {
          db.prepare("DELETE FROM sessions WHERE user_id=?").run(req.user.id);
          req.user = undefined;
          req.session = undefined;
          res.clearCookie("hiewly_session", { path: "/" });
        }
      }
    }
    next();
  });
  app.use("/api", (req, res, next) => {
    const safe =
      [
        "/me",
        "/public",
        "/health",
        "/auth/password",
        "/auth/logout",
        "/auth/login",
      ].includes(req.path) ||
      (req.method === "GET" &&
        (req.path === "/products" || /^\/media\/[a-f0-9]{32}$/.test(req.path)));
    if (req.user?.must_change_password && !safe)
      return res.status(403).json({
        error: "กรุณาเปลี่ยนรหัสผ่านชั่วคราวก่อนใช้งาน",
        code: "PASSWORD_CHANGE_REQUIRED",
      });
    next();
  });
  const permissionsAny =
    (...ps) =>
    (req, res, next) => {
      if (ps.some((p) => hasPermission(req.user, p))) return next();
      return res
        .status(req.user ? 403 : 401)
        .json({ error: "คุณไม่มีสิทธิ์ใช้งานส่วนนี้" });
    };
  const auth = (req, res, next) =>
    req.user ? next() : res.status(401).json({ error: "กรุณาเข้าสู่ระบบ" });
  const csrf = (req, res, next) =>
    req.session && req.get("x-csrf-token") === req.session.csrf
      ? next()
      : res.status(403).json({ error: "เซสชันไม่ถูกต้อง กรุณาโหลดหน้าใหม่" });
  const permission = (p) => (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "กรุณาเข้าสู่ระบบ" });
    return hasPermission(req.user, p)
      ? next()
      : res.status(403).json({ error: "คุณไม่มีสิทธิ์ใช้งานส่วนนี้" });
  };
  const authLimiter = rateLimit({
    windowMs: 15 * 60000,
    limit: config.production ? 20 : (config.authRateLimit ?? 20),
    message: { error: "เข้าสู่ระบบหลายครั้งเกินไป กรุณารอ 15 นาที" },
  });
  function session(req, res, user, redirectTo = null, redirectAfter = null) {
    if (req.cookies.hiewly_session)
      db.prepare("DELETE FROM sessions WHERE token=?").run(
        hash(req.cookies.hiewly_session),
      );
    db.prepare("DELETE FROM sessions WHERE expires_at<?").run(now());
    const token = randomBytes(32).toString("hex"),
      csrfToken = id();
    db.prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(
      hash(token),
      user.id,
      csrfToken,
      new Date(Date.now() + 8 * 3600000).toISOString(),
    );
    res.cookie("hiewly_session", token, {
      httpOnly: true,
      secure: config.production || config.origin.startsWith("https:"),
      sameSite: "strict",
      maxAge: 8 * 3600000,
      path: "/",
    });
    if (redirectTo) return res.redirect(303, config.origin + redirectTo);
    res.json({
      ...(redirectAfter ? { redirectTo: redirectAfter } : {}),
      user: safeUser(
        db
          .prepare(
            "SELECT u.*,r.name role_name,r.permissions FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=?",
          )
          .get(user.id),
      ),
      csrf: csrfToken,
    });
  }
  app.get("/api/health", (req, res) => res.json({ ok: true }));
  attachGoogleAuth(app, db, config, { session, authLimiter, asyncRoute });
  attachSocialDisconnect(app, db, config, { authLimiter, asyncRoute });
  attachLineAuth(app, db, config, { session, authLimiter, asyncRoute });
  app.get(
    "/api/line/bank-card/:fingerprint/:size",
    rateLimit({ windowMs: 60000, limit: 30 }),
    asyncRoute(async (req, res) => {
      if (
        !/^[a-f0-9]{64}$/.test(req.params.fingerprint) ||
        !["original.png", "preview.png"].includes(req.params.size)
      )
        fail(404, "ไม่พบรูปบัญชีรับเงิน");
      const card = await getBankCard(db, config, req.params.fingerprint);
      res
        .set({
          "Content-Type": "image/png",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        })
        .send(
          req.params.size === "original.png" ? card.original : card.preview,
        );
    }),
  );
  app.get("/api/me", (req, res) =>
    res.json({
      user: safeUser(req.user),
      csrf: req.user ? req.session.csrf : null,
    }),
  );
  app.post(
    "/api/auth/register",
    authLimiter,
    asyncRoute((req, res) => {
      const input = parse(
        memberProfileSchema.extend({
          password: z.string().min(passwordPolicy.minimumLength).max(128),
          referralCode: z.string().max(40).optional(),
        }),
        req.body,
      );
      if (db.prepare("SELECT id FROM users WHERE email=?").get(input.email))
        fail(409, "อีเมลนี้ถูกใช้งานแล้ว");
      const ref = input.referralCode
        ? db
            .prepare("SELECT id FROM users WHERE referral_code=? AND active=1")
            .get(input.referralCode)
        : null;
      if (input.referralCode && !ref) fail(400, "รหัสแนะนำไม่ถูกต้อง");
      const uid = id();
      transaction(db, () => {
        db.prepare(
          "INSERT INTO users(id,name,email,password,role_id,referral_code,referred_by,created_at,first_name,last_name,phone,discovery_source,line_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
        ).run(
          uid,
          input.firstName + " " + input.lastName,
          input.email,
          passwordHash(input.password),
          "customer",
          id().slice(0, 10),
          ref?.id || null,
          now(),
          input.firstName,
          input.lastName,
          input.phone,
          input.discoverySource,
          input.lineId,
        );
        audit(db, uid, "member.registered", uid, { referred: !!ref });
      });
      session(req, res, { id: uid });
    }),
  );
  const dummyHash = passwordHash(randomBytes(24).toString("hex"));
  app.post(
    "/api/auth/login",
    authLimiter,
    asyncRoute((req, res) => {
      const input = parse(
        z.object({
          email: z.email().transform((v) => v.toLowerCase()),
          password: z.string().min(1).max(128),
        }),
        req.body,
      );
      const user = db
        .prepare("SELECT * FROM users WHERE email=?")
        .get(input.email);
      const valid = passwordMatches(
        input.password,
        user?.password || dummyHash,
      );
      if (
        !user ||
        !valid ||
        !user.has_password ||
        !user.active ||
        (user.must_change_password && user.password_reset_expires_at <= now())
      ) {
        audit(db, null, "auth.login_failed", "session");
        fail(401, "อีเมลหรือรหัสผ่านไม่ถูกต้อง");
      }
      audit(db, user.id, "auth.login", "session");
      session(req, res, user);
    }),
  );
  app.post("/api/auth/logout", auth, csrf, (req, res) => {
    db.prepare("DELETE FROM sessions WHERE token=?").run(req.session.token);
    res.clearCookie("hiewly_session", { path: "/" });
    res.json({ ok: true });
  });
  app.post(
    "/api/auth/password",
    auth,
    csrf,
    authLimiter,
    asyncRoute((req, res) => {
      const v = parse(
        z.object({
          current: z.string().min(1).max(128),
          password: z.string().min(passwordPolicy.minimumLength).max(128),
          confirmPassword: z.string().optional(),
        }),
        req.body,
      );
      if (!passwordMatches(v.current, req.user.password))
        fail(400, "รหัสผ่านปัจจุบันไม่ถูกต้อง");
      if (v.current === v.password)
        fail(400, "กรุณาตั้งรหัสผ่านใหม่ที่ต่างจากรหัสเดิม");
      if (req.user.must_change_password && v.confirmPassword !== v.password)
        fail(400, "ยืนยันรหัสผ่านใหม่ไม่ตรงกัน");
      transaction(db, () => {
        db.prepare(
          "UPDATE users SET password=?,must_change_password=0,password_reset_expires_at=NULL,member_version=member_version+1 WHERE id=?",
        ).run(passwordHash(v.password), req.user.id);
        db.prepare("DELETE FROM sessions WHERE user_id=?").run(req.user.id);
        audit(db, req.user.id, "auth.password_changed", req.user.id);
      });
      res.clearCookie("hiewly_session", { path: "/" });
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/public",
    asyncRoute((req, res) => {
      const s = getSettings(db);
      res.json({
        ...publicExperience(db, config),
        shopName: s.shopName,
        depositPercent: s.depositPercent,
        announcements: db
          .prepare(
            "SELECT id,title,body,image,version FROM announcements WHERE active=1 AND starts_at<=? AND ends_at>=? ORDER BY position,rowid DESC LIMIT 30",
          )
          .all(now(), now()),
        categories: db
          .prepare(
            "SELECT DISTINCT category FROM products WHERE active=1 ORDER BY category",
          )
          .all()
          .map((r) => r.category),
      });
    }),
  );
  app.get(
    "/api/products",
    asyncRoute((req, res) => {
      const rawQuery = new URL(req.originalUrl, "http://catalog.local")
        .searchParams;
      const scalar = (name) => {
        const values = rawQuery.getAll(name);
        if (
          values.length > 1 ||
          [...rawQuery.keys()].some((key) => key.startsWith(name + "["))
        )
          fail(400, "ตัวกรองสินค้าไม่ถูกต้อง");
        return values[0] || "";
      };
      const price = (name) => {
        const value = scalar(name);
        if (value === "") return null;
        if (
          !/^\d+$/.test(value) ||
          !Number.isSafeInteger(Number(value)) ||
          Number(value) > 100000000
        )
          fail(400, "ช่วงราคาต้องเป็นจำนวนสตางค์ตั้งแต่ 0 ถึง 100000000");
        return Number(value);
      };
      const minPrice = price("minPrice"),
        maxPrice = price("maxPrice"),
        inStock = scalar("inStock"),
        sort = scalar("sort") || "newest",
        cat = scalar("category"),
        q = scalar("q").slice(0, 100),
        ids = scalar("ids").split(",").filter(Boolean).slice(0, 50),
        shopId = scalar("shop");
      if (minPrice !== null && maxPrice !== null && minPrice > maxPrice)
        fail(400, "ราคาสูงสุดต้องไม่น้อยกว่าราคาต่ำสุด");
      if (!["", "0", "1"].includes(inStock))
        fail(400, "ตัวกรองสต็อกไม่ถูกต้อง");
      const sorts = {
        newest: "created_at DESC,id ASC",
        "price-asc": "price ASC,id ASC",
        "price-desc": "price DESC,id ASC",
        name: "name COLLATE NOCASE ASC,id ASC",
      };
      if (!Object.hasOwn(sorts, sort)) fail(400, "การเรียงสินค้าไม่ถูกต้อง");
      const conditions = ["active=1", "name LIKE ?", "(?='' OR category=?)"],
        values = ["%" + q + "%", cat, cat];
      if (shopId) {
        const shop = findPublicShop(db, shopId);
        conditions.push("consignor_id=?", "consignment_status='approved'");
        values.push(shop.user_id);
      }
      if (minPrice !== null) {
        conditions.push("price>=?");
        values.push(minPrice);
      }
      if (maxPrice !== null) {
        conditions.push("price<=?");
        values.push(maxPrice);
      }
      if (inStock === "1") conditions.push("stock>0");
      if (ids.length) {
        conditions.push(`id IN (${ids.map(() => "?").join(",")})`);
        values.push(...ids);
      }
      res.json(
        productPage(
          pageRows(
            db,
            "SELECT id,name,description,category,price,stock,image,images,created_at,(SELECT COALESCE(AVG(rating),0) FROM reviews WHERE product_id=products.id AND visible=1) rating_average,(SELECT COUNT(*) FROM reviews WHERE product_id=products.id AND visible=1) review_count FROM products WHERE " +
              conditions.join(" AND ") +
              " ORDER BY " +
              sorts[sort],
            values,
            req,
          ),
          db,
        ),
      );
    }),
  );
  app.get(
    "/api/wallet",
    auth,
    asyncRoute((req, res) =>
      res.json({
        balance: req.user.balance,
        ...pageRows(
          db,
          "SELECT l.*,CASE WHEN x.event_id IS NOT NULL THEN 'LINE' ELSE '' END topup_channel FROM ledger l LEFT JOIN line_topups x ON l.kind='topup' AND x.topup_id=l.reference WHERE l.user_id=? ORDER BY l.created_at DESC",
          [req.user.id],
          req,
        ),
      }),
    ),
  );
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 4 * 1024 * 1024, files: 1, fields: 2 },
  });
  app.post(
    "/api/wallet/topup",
    auth,
    csrf,
    rateLimit({
      windowMs: 60000,
      limit: 6,
      message: { error: "ตรวจสลิปหลายครั้งเกินไป กรุณารอสักครู่" },
    }),
    upload.single("image"),
    asyncRoute(async (req, res) => {
      const key = keyOf(req),
        amount = parse(
          money.refine((v) => v > 0),
          Number(req.body.amount),
        ),
        s = getSettings(db);
      if (!merchantAccounts(s).length)
        fail(503, "ร้านยังไม่ได้ตั้งค่าบัญชีรับเงิน");
      const f = req.file;
      if (!f) fail(400, "กรุณาแนบรูปสลิป");
      const b = f.buffer;
      const type =
        b[0] === 0xff && b[1] === 0xd8
          ? "image/jpeg"
          : b
                .subarray(0, 8)
                .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            ? "image/png"
            : b.toString("ascii", 0, 4) === "RIFF" &&
                b.toString("ascii", 8, 12) === "WEBP"
              ? "image/webp"
              : b.toString("ascii", 0, 3) === "GIF"
                ? "image/gif"
                : null;
      if (!type || f.mimetype !== type)
        fail(400, "ไฟล์ต้องเป็นรูป JPEG, PNG, GIF หรือ WebP จริง");
      const imageHash = hash(b),
        old = db
          .prepare("SELECT * FROM topups WHERE user_id=? AND request_key=?")
          .get(req.user.id, key);
      if (old) {
        if (old.image_hash !== imageHash || old.amount !== amount)
          fail(409, "รหัสคำขอถูกใช้กับข้อมูลอื่นแล้ว");
        return res.json(old);
      }
      if (db.prepare("SELECT id FROM topups WHERE image_hash=?").get(imageHash))
        fail(409, "สลิปนี้ถูกใช้งานแล้ว");
      try {
        const verified = await easySlip(db, config, f, amount);
        res.json(
          creditTopup(db, req.user.id, key, imageHash, amount, verified, s),
        );
      } catch (e) {
        audit(db, req.user.id, "wallet.topup_rejected", "topup", {
          reason: e.status ? "validation_or_provider" : "network_error",
        });
        throw e;
      }
    }),
  );
  app.get(
    "/api/referrals",
    auth,
    asyncRoute((req, res) =>
      res.json({
        code: req.user.referral_code,
        commissionPercent: getSettings(db).commissionPercent,
        commissionCap: getSettings(db).commissionCap ?? null,
        commissions: pageRows(
          db,
          "SELECT order_id,rate_bps,base,amount,status,created_at,paid_at FROM commissions WHERE referrer_id=? ORDER BY created_at DESC",
          [req.user.id],
          req,
        ),
        commissionTotals: db
          .prepare(
            "SELECT COALESCE(SUM(CASE WHEN status='pending' THEN amount ELSE 0 END),0) pending,COALESCE(SUM(CASE WHEN status='credited' THEN amount ELSE 0 END),0) credited FROM commissions WHERE referrer_id=?",
          )
          .get(req.user.id),
        count: db
          .prepare("SELECT COUNT(*) n FROM users WHERE referred_by=?")
          .get(req.user.id).n,
        converted: db
          .prepare(
            "SELECT COUNT(DISTINCT o.user_id) n FROM orders o JOIN users u ON u.id=o.user_id WHERE u.referred_by=? AND o.status!='cancelled' AND o.paid=o.total",
          )
          .get(req.user.id).n,
      }),
    ),
  );
  app.post(
    "/api/orders/quote",
    auth,
    csrf,
    asyncRoute((req, res) =>
      res.json(
        publicQuote(quote(db, req.user.id, parse(cartSchema, req.body))),
      ),
    ),
  );
  app.post(
    "/api/orders",
    auth,
    csrf,
    asyncRoute((req, res) =>
      res
        .status(201)
        .json(
          createOrder(
            db,
            req.user.id,
            parse(checkoutSchema, req.body),
            keyOf(req),
          ),
        ),
    ),
  );
  app.get(
    "/api/orders",
    auth,
    asyncRoute((req, res) => {
      const rows = pageRows(
        db,
        "SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC",
        [req.user.id],
        req,
      );
      rows.items = rows.items.map((o) => ({
        ...o,
        shipping: JSON.parse(o.shipping),
        items: db
          .prepare(
            "SELECT product_id,name,price,quantity FROM order_items WHERE order_id=?",
          )
          .all(o.id),
      }));
      res.json(rows);
    }),
  );
  app.post(
    "/api/orders/:id/pay",
    auth,
    csrf,
    asyncRoute((req, res) =>
      res.json(payOrder(db, req.user.id, req.params.id)),
    ),
  );
  app.post(
    "/api/orders/:id/cancel",
    auth,
    csrf,
    asyncRoute((req, res) =>
      res.json(cancelOrder(db, req.user.id, req.params.id)),
    ),
  );

  app.use("/api/admin", auth, (req, res, next) =>
    ["GET", "HEAD"].includes(req.method) ? next() : csrf(req, res, next),
  );
  attachAdminWallet(app, db, { permission, asyncRoute, pageRows });
  app.get(
    "/api/admin/dashboard",
    permission("dashboard"),
    asyncRoute((req, res) => {
      const days = Math.min(90, Math.max(7, Number(req.query.days) || 7)),
        since = new Date(Date.now() + 7 * 3600000 - (days - 1) * 86400000);
      since.setUTCHours(0, 0, 0, 0);
      const orders = db
        .prepare(
          "SELECT COUNT(*) count,COALESCE(SUM(CASE WHEN status!='cancelled' THEN total ELSE 0 END),0) sales,COALESCE(SUM(CASE WHEN status NOT IN ('cancelled','completed') THEN total-paid ELSE 0 END),0) outstanding FROM orders",
        )
        .get();
      const flows = db
        .prepare(
          "SELECT COALESCE(SUM(CASE WHEN kind IN ('purchase','settlement') THEN -amount WHEN kind='refund' THEN -amount ELSE 0 END),0) received,COALESCE(SUM(CASE WHEN kind IN ('topup','admin_topup') THEN amount ELSE 0 END),0) topups FROM ledger",
        )
        .get();
      const manual = db
        .prepare(
          "SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) income,COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) expense FROM expenses",
        )
        .get();
      const bar = [];
      for (let i = 0; i < days; i++) {
        const date = new Date(since.getTime() + i * 86400000)
          .toISOString()
          .slice(0, 10);
        const a = db
          .prepare(
            "SELECT COALESCE(SUM(CASE WHEN kind IN ('purchase','settlement','refund') THEN -amount ELSE 0 END),0) income FROM ledger WHERE date(created_at,'+7 hours')=?",
          )
          .get(date);
        const e = db
          .prepare(
            "SELECT COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) expense,COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) income FROM expenses WHERE date(created_at,'+7 hours')=?",
          )
          .get(date);
        bar.push({
          date,
          income: a.income + e.income,
          expense:
            e.expense +
            db
              .prepare(
                "SELECT COALESCE(SUM(amount),0) n FROM ledger WHERE kind IN ('commission','consignment') AND date(created_at,'+7 hours')=?",
              )
              .get(date).n,
        });
      }
      res.json({
        orders,
        ...flows,
        ...manual,
        sales: orders.sales,
        received: flows.received + manual.income,
        expense:
          manual.expense +
          db
            .prepare(
              "SELECT COALESCE(SUM(amount),0) n FROM ledger WHERE kind IN ('commission','consignment')",
            )
            .get().n,
        net:
          flows.received +
          manual.income -
          manual.expense -
          db
            .prepare(
              "SELECT COALESCE(SUM(amount),0) n FROM ledger WHERE kind IN ('commission','consignment')",
            )
            .get().n,
        commissionExpense: db
          .prepare(
            "SELECT COALESCE(SUM(amount),0) n FROM ledger WHERE kind='commission'",
          )
          .get().n,
        walletLiability: db
          .prepare("SELECT COALESCE(SUM(balance),0) n FROM users")
          .get().n,
        members: db
          .prepare("SELECT COUNT(*) n FROM users WHERE role_id='customer'")
          .get().n,
        products: db
          .prepare("SELECT COUNT(*) n FROM products WHERE active=1")
          .get().n,
        bar,
        statuses: db
          .prepare("SELECT status,COUNT(*) count FROM orders GROUP BY status")
          .all(),
        recent: db
          .prepare(
            "SELECT o.id,o.total,o.status,o.created_at,u.name FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.created_at DESC LIMIT 5",
          )
          .all(),
        lowStock: db
          .prepare(
            "SELECT id,name,stock FROM products WHERE active=1 AND stock<5 ORDER BY stock LIMIT 5",
          )
          .all(),
      });
    }),
  );
  app.get(
    "/api/admin/product-categories",
    permission("products"),
    asyncRoute((req, res) => {
      res.json(
        db
          .prepare("SELECT DISTINCT category FROM products ORDER BY category")
          .all()
          .map((r) => r.category),
      );
    }),
  );
  for (const [resource, table, schema, search] of [
    ["products", "products", productSchema, "name"],
    ["promotions", "promotions", promoSchema, "code"],
    ["announcements", "announcements", announcementSchema, "title"],
  ]) {
    app.get(
      `/api/admin/${resource}`,
      permission(resource),
      asyncRoute((req, res) => {
        const rows = pageRows(
          db,
          `SELECT * FROM ${table} WHERE ${search} LIKE ? ORDER BY rowid DESC`,
          ["%" + paging(req).q + "%"],
          req,
        );
        res.json(table === "products" ? productPage(rows) : rows);
      }),
    );
    app.post(
      `/api/admin/${resource}`,
      permission(resource),
      asyncRoute((req, res) => {
        const v = parse(schema, req.body);
        if (table === "products") prepareProductImages(db, v);
        if (table === "promotions") checkMedia(db, v.image, "promotion");
        if (table === "announcements") checkMedia(db, v.image, "announcement");
        delete v.version;
        const rid = id(),
          row = {
            id: rid,
            ...v,
            ...(table === "products" ? { created_at: now() } : {}),
          };
        transaction(db, () => {
          const cols = Object.keys(row);
          db.prepare(
            `INSERT INTO ${table}(${cols.join(",")}) VALUES(${cols.map(() => "?").join(",")})`,
          ).run(
            ...Object.values(row).map((x) =>
              typeof x === "boolean" ? Number(x) : x,
            ),
          );
          audit(db, req.user.id, `${resource}.created`, rid);
        });
        res.status(201).json({ id: rid });
      }),
    );
    app.put(
      `/api/admin/${resource}/:id`,
      permission(resource),
      asyncRoute((req, res) => {
        const v = parse(schema, req.body),
          version = v.version;
        if (table === "products") prepareProductImages(db, v);
        if (table === "promotions") checkMedia(db, v.image, "promotion");
        if (table === "announcements") checkMedia(db, v.image, "announcement");
        delete v.version;
        if (!version) fail(400, "ไม่มีเวอร์ชันข้อมูล กรุณาโหลดใหม่");
        transaction(db, () => {
          const entries = Object.entries(v);
          let consignmentProduct;
          if (table === "products") {
            const old = db
              .prepare("SELECT * FROM products WHERE id=?")
              .get(req.params.id);
            if (old?.consignor_id) {
              consignmentProduct = old;
              const ps = JSON.parse(req.user.permissions);
              if (!ps.includes("*") && !ps.includes("consignments"))
                fail(403, "ต้องมีสิทธิ์ฝากขายเพื่อแก้ไขสินค้าของตัวแทน");
              if (
                v.active &&
                db
                  .prepare("SELECT status FROM consignors WHERE user_id=?")
                  .get(old.consignor_id)?.status !== "approved"
              )
                fail(409, "ตัวแทนฝากขายยังไม่ได้รับอนุมัติ");
              entries.push([
                "consignment_status",
                v.active ? "approved" : "pending",
              ]);
            }
          }
          const result = db
            .prepare(
              `UPDATE ${table} SET ${entries.map(([k]) => k + "=?").join(",")},version=version+1 WHERE id=? AND version=?`,
            )
            .run(
              ...entries.map(([, x]) =>
                typeof x === "boolean" ? Number(x) : x,
              ),
              req.params.id,
              version,
            );
          if (!result.changes) fail(409, "ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใหม่");
          if (consignmentProduct) {
            if (!v.active)
              notifyProductRequest(db, {
                ...consignmentProduct,
                name: v.name,
                version: version + 1,
              });
            else {
              resolveApprovalNotices(
                db,
                "consignment.product",
                consignmentProduct.id,
              );
              if (
                consignmentProduct.consignment_status !== "approved" ||
                !consignmentProduct.active
              )
                notifyProductDecision(
                  db,
                  { ...consignmentProduct, name: v.name },
                  true,
                  version + 1,
                );
            }
          }
          audit(db, req.user.id, `${resource}.updated`, req.params.id);
        });
        res.json({ ok: true });
      }),
    );
  }
  app.get(
    "/api/admin/orders",
    permission("orders"),
    asyncRoute((req, res) => {
      const rows = pageRows(
        db,
        "SELECT o.*,u.name,u.email FROM orders o JOIN users u ON u.id=o.user_id WHERE (o.id LIKE ? OR u.name LIKE ?) ORDER BY o.created_at DESC",
        Array(2).fill("%" + paging(req).q + "%"),
        req,
      );
      rows.items = rows.items.map((o) => ({
        ...o,
        shipping: JSON.parse(o.shipping),
        items: db
          .prepare("SELECT * FROM order_items WHERE order_id=?")
          .all(o.id)
          .map((item) =>
            hasPermission(req.user, "finance") ||
            hasPermission(req.user, "products")
              ? item
              : (({ cost, ...safe }) => safe)(item),
          ),
      }));
      res.json(rows);
    }),
  );
  app.post(
    "/api/admin/orders/:id/cancel",
    permission("orders_cancel"),
    asyncRoute((req, res) =>
      res.json(cancelOrder(db, req.user.id, req.params.id, true)),
    ),
  );
  app.put(
    "/api/admin/orders/:id",
    permission("orders_update"),
    asyncRoute((req, res) => {
      const v = parse(
        z.object({
          status: z.enum(["processing", "shipped", "completed"]),
          tracking: z.string().trim().max(100).default(""),
        }),
        req.body,
      );
      transaction(db, () => {
        const o = db
          .prepare("SELECT * FROM orders WHERE id=?")
          .get(req.params.id);
        if (!o) fail(404, "ไม่พบคำสั่งซื้อ");
        const allowed = {
          paid: ["processing"],
          processing: ["shipped"],
          shipped: ["completed"],
        };
        if (!allowed[o.status]?.includes(v.status))
          fail(409, "ลำดับสถานะคำสั่งซื้อไม่ถูกต้อง");
        if (o.paid !== o.total) fail(409, "ต้องชำระเงินครบก่อนจัดส่ง");
        if (v.status === "shipped" && !v.tracking)
          fail(400, "กรุณาระบุเลขพัสดุ");
        db.prepare("UPDATE orders SET status=?,tracking=? WHERE id=?").run(
          v.status,
          v.tracking || o.tracking,
          o.id,
        );
        if (v.status === "completed") settleCommission(db, o.id);
        if (v.status === "completed") settleConsignments(db, o.id);
        audit(db, req.user.id, "order.status_changed", o.id, v);
      });
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/admin/finance",
    permission("finance"),
    asyncRoute((req, res) =>
      res.json({
        manual: pageRows(
          db,
          "SELECT e.*,u.name FROM expenses e JOIN users u ON u.id=e.actor_id ORDER BY e.created_at DESC",
          [],
          { query: { ...req.query, page: req.query.manualPage || 1 } },
        ),
        ledger: pageRows(
          db,
          "SELECT l.*,u.name FROM ledger l JOIN users u ON u.id=l.user_id ORDER BY l.created_at DESC",
          [],
          { query: { ...req.query, page: req.query.ledgerPage || 1 } },
        ),
      }),
    ),
  );
  app.post(
    "/api/admin/finance",
    permission("finance_write"),
    asyncRoute((req, res) => {
      const v = parse(
          z.object({
            type: z.enum(["income", "expense"]),
            category: boundedText,
            description: z.string().trim().min(2).max(500),
            amount: money.refine((x) => x > 0),
          }),
          req.body,
        ),
        key = keyOf(req);
      transaction(db, () => {
        const old = db
          .prepare("SELECT * FROM expenses WHERE request_key=?")
          .get(key);
        if (old) {
          if (
            old.actor_id !== req.user.id ||
            old.amount !== v.amount ||
            old.type !== v.type ||
            old.category !== v.category ||
            old.description !== v.description
          )
            fail(409, "รหัสคำขอถูกใช้แล้ว");
          return;
        }
        const rid = id();
        db.prepare("INSERT INTO expenses VALUES(?,?,?,?,?,?,?,?)").run(
          rid,
          v.type,
          v.category,
          v.description,
          v.amount,
          key,
          now(),
          req.user.id,
        );
        audit(db, req.user.id, "finance.created", rid, v);
      });
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/admin/finance/export",
    permission("finance_export"),
    asyncRoute((req, res) => {
      const rows = db
        .prepare(
          "SELECT created_at,type,category,description,amount FROM expenses ORDER BY created_at DESC LIMIT 10000",
        )
        .all();
      const cell = (v) =>
        '"' +
        String(v)
          .replace(/^[=+@\-]/, "'$&")
          .replaceAll('"', '""') +
        '"';
      res
        .set("Content-Type", "text/csv; charset=utf-8")
        .set("Content-Disposition", 'attachment; filename="hiewly-finance.csv"')
        .send(
          "\ufeff" +
            [
              "date,type,category,description,amount_thb",
              ...rows.map((r) =>
                [
                  r.created_at,
                  r.type,
                  r.category,
                  r.description,
                  (r.amount / 100).toFixed(2),
                ]
                  .map(cell)
                  .join(","),
              ),
            ].join("\r\n"),
        );
    }),
  );
  app.get(
    "/api/admin/members",
    permission("members"),
    asyncRoute((req, res) => {
      const data = pageRows(
        db,
        "SELECT u.id,u.name,u.first_name,u.last_name,u.phone,u.discovery_source,u.line_id,u.email,u.role_id,u.balance,u.active,u.created_at,u.member_version,u.must_change_password,r.name role_name FROM users u JOIN roles r ON r.id=u.role_id WHERE u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ? OR u.line_id LIKE ? ORDER BY u.created_at DESC",
        Array(4).fill("%" + paging(req).q + "%"),
        req,
      );
      if (!hasPermission(req.user, "finance"))
        data.items = data.items.map(({ balance, ...row }) => row);
      res.json(data);
    }),
  );
  app.get(
    "/api/admin/roles",
    permissionsAny("members", "roles"),
    asyncRoute((req, res) =>
      res.json({
        roles: db
          .prepare("SELECT * FROM roles")
          .all()
          .map((r) => ({ ...r, permissions: JSON.parse(r.permissions) })),
        permissions: assignablePermissions.map((p) => p.id),
        permissionCatalog: assignablePermissions,
        presets: authorization.roles,
        ownerOnly: authorization.permissions.filter((p) => p.ownerOnly),
      }),
    ),
  );
  app.post(
    "/api/admin/roles",
    permission("roles"),
    asyncRoute((req, res) => {
      if (req.user.role_id !== "admin")
        fail(403, "ผู้ดูแลระบบเท่านั้นที่จัดการสิทธิ์ได้");
      const v = parse(roleSchema, req.body);
      const rid = id();
      transaction(db, () => {
        db.prepare("INSERT INTO roles VALUES(?,?,?)").run(
          rid,
          v.name,
          JSON.stringify([...new Set(v.permissions)]),
        );
        audit(db, req.user.id, "role.created", rid, v);
      });
      res.status(201).json({ id: rid });
    }),
  );
  app.put(
    "/api/admin/roles/:id",
    permission("roles"),
    asyncRoute((req, res) => {
      if (
        req.user.role_id !== "admin" ||
        ["admin", "customer"].includes(req.params.id)
      )
        fail(403, "แก้ไขบทบาทระบบไม่ได้");
      const v = parse(roleSchema, req.body);
      transaction(db, () => {
        const result = db
          .prepare("UPDATE roles SET name=?,permissions=? WHERE id=?")
          .run(
            v.name,
            JSON.stringify([...new Set(v.permissions)]),
            req.params.id,
          );
        if (!result.changes) fail(404, "ไม่พบบทบาท");
        db.prepare(
          "DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE role_id=?)",
        ).run(req.params.id);
        audit(db, req.user.id, "role.updated", req.params.id, v);
      });
      res.json({ ok: true });
    }),
  );
  app.put(
    "/api/admin/members/:id",
    permission("members"),
    permission("roles"),
    asyncRoute((req, res) => {
      if (req.user.role_id !== "admin")
        fail(403, "ผู้ดูแลระบบเท่านั้นที่เปลี่ยนสิทธิ์ได้");
      const v = parse(
        z.object({ role_id: z.string(), active: z.boolean() }),
        req.body,
      );
      transaction(db, () => {
        const u = db
          .prepare("SELECT * FROM users WHERE id=?")
          .get(req.params.id);
        if (!u || !db.prepare("SELECT id FROM roles WHERE id=?").get(v.role_id))
          fail(404, "ไม่พบสมาชิกหรือบทบาท");
        if (
          u.role_id === "admin" &&
          (v.role_id !== "admin" || !v.active) &&
          db
            .prepare(
              "SELECT COUNT(*) n FROM users WHERE role_id='admin' AND active=1",
            )
            .get().n <= 1
        )
          fail(409, "ต้องเหลือผู้ดูแลระบบอย่างน้อยหนึ่งคน");
        db.prepare(
          "UPDATE users SET role_id=?,active=?,member_version=member_version+1 WHERE id=?",
        ).run(v.role_id, Number(v.active), u.id);
        db.prepare("DELETE FROM sessions WHERE user_id=?").run(u.id);
        audit(db, req.user.id, "member.permissions_changed", u.id, v);
      });
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/admin/settings",
    permission("settings"),
    asyncRoute((req, res) => {
      const s = getSettings(db);
      for (const k of SECRET_KEYS) {
        s[k + "Configured"] = !!secret(db, k, config);
        delete s[k];
      }
      res.json({
        ...s,
        paymentQrReady: !!currentPaymentQr(
          s,
          hash(secret(db, "easyslipApiKey", config)),
        ),
        webhookUrl: `${config.origin}/api/line/webhook`,
        lineLoginCallback: `${config.origin}/api/auth/line/callback`,
        lineLoginReady: !!lineConfiguration(db, config),
        botEvents: db
          .prepare(
            "SELECT id,status,attempts,error,created_at FROM webhook_events ORDER BY created_at DESC LIMIT 10",
          )
          .all(),
      });
    }),
  );
  const settingsSchema = z.object({
    shopName: boundedText,
    depositPercent: z.number().int().min(0).max(100),
    bankCode: z.string().regex(/^(?:\d{3})?$/),
    bankNumber: z.string().regex(/^(?:\d{10,15})?$/),
    bankName: z.string().trim().max(200),
    accountName: z.string().trim().max(200),
    accountNameEn: z.string().trim().max(200),
    paymentQr: z.string().max(100).optional(),
    socialVisibility: z
      .record(z.string(), z.boolean())
      .optional()
      .refine(
        (value) =>
          Object.keys(value || {}).every((key) =>
            socialPlatforms.some((p) => p.key === key),
          ),
        "ช่องทางติดต่อไม่ถูกต้อง",
      ),
    socials: z
      .record(z.string(), z.string().max(500))
      .optional()
      .superRefine((value, ctx) => {
        for (const [key, link] of Object.entries(value || {})) {
          const platform = socialPlatforms.find((p) => p.key === key);
          let valid = !!platform;
          if (link) {
            try {
              const u = new URL(link);
              valid &&=
                u.protocol === "https:" &&
                !u.username &&
                !u.password &&
                !u.port &&
                platform.hosts.some(
                  (host) => u.hostname === host || u.hostname === "www." + host,
                );
            } catch {
              valid = false;
            }
          }
          if (!valid)
            ctx.addIssue({
              code: "custom",
              path: [key],
              message: "ใช้ลิงก์ HTTPS ของช่องทางนี้เท่านั้น",
            });
        }
      }),
    botEnabled: z.boolean(),
    aiEnabled: z.boolean(),
    aiModel: z.string().regex(/^[a-zA-Z0-9.-]{1,80}$/),
    botGreeting: z.string().min(1).max(4500),
    aiInstructions: z.string().min(1).max(3000),
    easyslipApiKey: z.string().max(500).optional(),
    lineChannelSecret: z.string().max(500).optional(),
    lineChannelAccessToken: z.string().max(1000).optional(),
    lineLoginChannelId: z
      .string()
      .regex(/^(?:\d{5,20})?$/)
      .optional(),
    lineLoginChannelSecret: z.string().trim().max(500).optional(),
    lineLoginEnabled: z.boolean().optional(),
    lineTopupEnabled: z.boolean().optional(),
    openaiApiKey: z.string().max(500).optional(),
  });
  app.put(
    "/api/admin/settings",
    permission("settings"),
    asyncRoute(async (req, res) => {
      const currentSettings = getSettings(db);
      const input = { ...req.body };
      for (const field of bankFields)
        if (input[field] === undefined)
          input[field] = currentSettings[field] || "";
      if (
        Array.isArray(currentSettings.merchantAccounts) &&
        (bankFields.some((k) => input[k] !== currentSettings[k]) ||
          (input.paymentQr !== undefined &&
            input.paymentQr !== currentSettings.paymentQr))
      )
        fail(409, "จัดการบัญชีรับเงินและ QR ที่เมนูบัญชีร้านค้า");
      const v = parse(settingsSchema, input);
      const lineBefore = getSettings(db);
      const lineEnabled = v.lineLoginEnabled ?? lineBefore.lineLoginEnabled;
      if (
        lineEnabled &&
        (!(v.lineLoginChannelId ?? lineBefore.lineLoginChannelId) ||
          !(
            v.lineLoginChannelSecret ||
            secret(db, "lineLoginChannelSecret", config)
          ))
      )
        fail(400, "กรุณาใส่ LINE Login Channel ID และ Channel Secret ให้ครบ");
      if (
        (v.lineTopupEnabled ?? lineBefore.lineTopupEnabled) &&
        (!lineEnabled ||
          !v.botEnabled ||
          !(v.easyslipApiKey || secret(db, "easyslipApiKey", config)))
      )
        fail(
          400,
          "เติมเงินผ่าน LINE ต้องเปิด LINE Login, LINE Chatbot และตั้งค่า EasySlip ก่อน",
        );
      if (v.paymentQr) checkMedia(db, v.paymentQr, "paymentQr");
      if (v.aiEnabled && !v.openaiApiKey && !secret(db, "openaiApiKey", config))
        fail(400, "กรุณาใส่ OpenAI API key ก่อนเปิด AI");
      if (
        v.botEnabled &&
        ((!v.lineChannelSecret && !secret(db, "lineChannelSecret", config)) ||
          (!v.lineChannelAccessToken &&
            !secret(db, "lineChannelAccessToken", config)))
      )
        fail(400, "กรุณาตั้งค่า LINE ให้ครบ");
      let paymentQrCleared = false;
      const snapshot = getSettings(db);
      const credentialBefore = hash(secret(db, "easyslipApiKey", config));
      const requested = v.paymentQr ?? snapshot.paymentQr;
      const receiverChanged =
        receivingAccountKey(v) !== receivingAccountKey(snapshot);
      const keyChanged =
        !!v.easyslipApiKey &&
        v.easyslipApiKey !== secret(db, "easyslipApiKey", config);
      let qrVerification = snapshot.paymentQrVerification;
      if (requested && requested !== snapshot.paymentQr) {
        const media = db
          .prepare("SELECT body FROM media WHERE id=? AND kind='paymentQr'")
          .get(requested.split("/").at(-1));
        if (keyChanged)
          fail(409, "บันทึก API key ใหม่ก่อน แล้วจึงอัปโหลด QR อีกครั้ง");
        qrVerification = {
          ...(await verifyPaymentQr(db, config, Buffer.from(media.body), v)),
          url: requested,
        };
      }
      transaction(db, () => {
        const before = getSettings(db);
        if (
          receivingAccountKey(before) !== receivingAccountKey(snapshot) ||
          before.paymentQr !== snapshot.paymentQr ||
          hash(secret(db, "easyslipApiKey", config)) !== credentialBefore
        )
          fail(409, "การตั้งค่าเปลี่ยนระหว่างตรวจสอบ กรุณาโหลดข้อมูลใหม่");
        const requestedQr = v.paymentQr ?? before.paymentQr;
        const receiver = receivingAccountKey(v);
        paymentQrCleared =
          !!requestedQr &&
          requestedQr === before.paymentQr &&
          (receiverChanged ||
            keyChanged ||
            before.paymentQrReceiver !== receiver ||
            !currentPaymentQr(before, credentialBefore));
        for (const [k, value] of Object.entries(v)) {
          if (k === "paymentQr") continue;
          if (k === "socialVisibility") {
            setSetting(db, k, { ...before.socialVisibility, ...value });
            continue;
          }
          if (SECRET_KEYS.includes(k)) {
            if (value) setSetting(db, k, encrypt(value, config.encryptionKey));
          } else setSetting(db, k, value);
        }
        const paymentQr = paymentQrCleared ? "" : requestedQr;
        setSetting(db, "paymentQr", paymentQr);
        setSetting(db, "paymentQrReceiver", paymentQr ? receiver : "");
        setSetting(
          db,
          "paymentQrVerification",
          paymentQr ? qrVerification : null,
        );
        audit(db, req.user.id, "settings.updated", "shop", {
          keys: Object.keys(v).filter((k) => !SECRET_KEYS.includes(k)),
          paymentQrCleared,
        });
      });
      res.json({ ok: true, paymentQrCleared });
    }),
  );
  app.get(
    "/api/admin/integrations/easyslip",
    permission("settings"),
    asyncRoute(async (req, res) => {
      const [banks, accounts] = await Promise.all([
        easyRequest(db, config, "banks"),
        easyRequest(db, config, "bank-accounts"),
      ]);
      const s = getSettings(db);
      res.json({
        banks,
        accounts,
        configuredAccount: { bankCode: s.bankCode, bankNumber: s.bankNumber },
        note: "บัญชีผู้รับต้องลงทะเบียนและเชื่อมโยงกับ Branch ใน EasySlip ด้วย",
      });
    }),
  );
  app.get(
    "/api/admin/audit",
    permission("audit"),
    asyncRoute((req, res) =>
      res.json({
        ...pageRows(
          db,
          "SELECT a.*,u.name actor_name FROM audit a LEFT JOIN users u ON u.id=a.actor_id WHERE a.action LIKE ? ORDER BY a.id DESC",
          ["%" + paging(req).q + "%"],
          req,
        ),
        chain: verifyAudit(db),
      }),
    ),
  );
  app.get(
    "/api/admin/commissions",
    permission("finance"),
    asyncRoute((req, res) =>
      res.json(
        pageRows(
          db,
          "SELECT c.*,u.name referrer_name FROM commissions c JOIN users u ON u.id=c.referrer_id ORDER BY c.created_at DESC",
          [],
          req,
        ),
      ),
    ),
  );
  attachMerchantAccounts(app, db, config, {
    auth,
    csrf,
    permission,
    asyncRoute,
  });
  attachAddresses(app, db, { auth, csrf, asyncRoute });
  attachProfileMedia(app, db, config, { auth, csrf, asyncRoute });
  attachPublicShops(app, db, { asyncRoute });
  attachNotifications(app, db, { auth, csrf, asyncRoute });
  attachMemberManagement(app, db, { permission, asyncRoute });
  attachConsignments(app, db, config, {
    auth,
    csrf,
    permission,
    asyncRoute,
    pageRows,
  });
  attachWithdrawals(app, db, { auth, csrf, permission, asyncRoute, pageRows });
  attachReviews(app, db, config, {
    auth,
    csrf,
    permission,
    asyncRoute,
    pageRows,
  });
  attachExperience(app, db, config, {
    auth,
    csrf,
    permission,
    asyncRoute,
    pageRows,
  });
  app.use("/api", (req, res) => res.status(404).json({ error: "ไม่พบ API" }));
  if (existsSync(resolve("dist/index.html"))) {
    app.use(
      express.static(resolve("dist"), { maxAge: config.production ? "1h" : 0 }),
    );
    app.get("/{*path}", (req, res) => res.sendFile(resolve("dist/index.html")));
  }
  app.use((err, req, res, next) => {
    if (err instanceof z.ZodError)
      return res.status(400).json({
        error: "ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบช่องที่ระบุ",
        fields: err.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
    if (err instanceof multer.MulterError)
      return res.status(400).json({
        error: "อัปโหลดไม่ได้ ไฟล์ต้องไม่เกิน 4 MB และแนบได้ครั้งละ 1 รูป",
      });
    if (
      err.code?.includes("CONSTRAINT") ||
      /UNIQUE constraint failed|CHECK constraint failed|FOREIGN KEY constraint failed/.test(
        err.message || "",
      )
    )
      return res
        .status(409)
        .json({ error: "ข้อมูลซ้ำหรือขัดแย้ง กรุณาโหลดข้อมูลใหม่" });
    if (err instanceof SyntaxError)
      return res.status(400).json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" });
    if (err.name === "TimeoutError" || err.name === "AbortError")
      return res.status(504).json({
        error: "บริการภายนอกตอบช้า กรุณาลองใหม่ โดยยังไม่มีการเพิ่มยอดเงิน",
      });
    if (!err.status) console.error("Request failed:", err.code || err.name);
    res.status(err.status || 500).json({
      error: err.status ? err.message : "เกิดข้อผิดพลาด กรุณาลองใหม่",
    });
  });
  return app;
}
