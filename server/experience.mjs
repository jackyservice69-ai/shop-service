import multer from "multer";
import sharp from "sharp";
import { z } from "zod";
import {
  id,
  now,
  audit,
  transaction,
  getSettings,
  setSetting,
  hash,
} from "./db.mjs";
import { fail } from "./commerce.mjs";
import { verifyPaymentQr } from "./payment-qr.mjs";
import { secret } from "./integrations.mjs";
import { hasPermission } from "../shared/authorization.mjs";
import {
  merchantAccounts,
  accountReceiver,
  receivingPublicData,
} from "./merchant-account-policy.mjs";
import { receivingAccountKey, currentPaymentQr } from "./receiving-policy.mjs";
export { receivingAccountKey, currentPaymentQr } from "./receiving-policy.mjs";

export const IMAGE_GUIDES = {
  paymentQr: {
    width: 1080,
    height: 1440,
    label: "QR รับเงิน",
    permission: "settings",
  },
  banner: {
    width: 1600,
    height: 600,
    label: "แบนเนอร์",
    permission: "banners",
  },
  announcement: {
    width: 1080,
    height: 1350,
    label: "ประกาศ",
    permission: "announcements",
  },
  promotion: {
    width: 1200,
    height: 800,
    label: "โปรโมชั่น",
    permission: "promotions",
  },
  logo: { width: 640, height: 240, label: "โลโก้", permission: "appearance" },
  favicon: {
    width: 256,
    height: 256,
    label: "Favicon",
    permission: "appearance",
  },
  product: {
    width: 1200,
    height: 1200,
    label: "สินค้า",
    permission: "products",
  },
};
export function checkMedia(db, url, kind) {
  if (!url) return;
  if (
    !/^\/api\/media\/[a-f0-9]{32}$/.test(url) ||
    !db
      .prepare("SELECT id FROM media WHERE id=? AND kind=?")
      .get(url.split("/").at(-1), kind)
  )
    fail(400, "กรุณาอัปโหลดรูปสำหรับ" + IMAGE_GUIDES[kind].label + "ผ่านระบบ");
}
const color = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "ใช้รหัสสี HEX 6 หลัก เช่น #C4B5FD");
const commissionRateSchema = z.number().min(0).max(100).multipleOf(0.01);
export const appearanceSchema = z
  .object({
    theme: z.object({
      primary: color,
      ink: color,
      muted: color,
      background: color,
      surface: color,
      positive: color,
    }),
    logo: z.string().default(""),
    favicon: z.string().default(""),
    slideSeconds: z.number().int().min(3).max(30),
    commissionPercent: commissionRateSchema.optional(),
  })
  .strict();
const bannerSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    image: z.string().min(1),
    link: z
      .string()
      .max(500)
      .default("")
      .refine(
        (v) => v === "" || /^\/(?!\/)[a-zA-Z0-9/?=&%_.#-]*$/.test(v),
        "ลิงก์ต้องเป็นเส้นทางในร้าน เช่น /promotions",
      ),
    position: z.number().int().min(0).max(1000),
    active: z.boolean(),
    starts_at: z.iso.datetime(),
    ends_at: z.iso.datetime(),
    version: z.number().int().optional(),
  })
  .refine((v) => v.ends_at > v.starts_at, "วันสิ้นสุดต้องหลังวันเริ่ม");
export function publicExperience(db, config) {
  const s = getSettings(db);
  const key = secret(db, "easyslipApiKey", config);
  return {
    theme: s.theme,
    logo: s.logo,
    favicon: s.favicon,
    ...receivingPublicData(s, hash(key), !!key),
    socials: Object.fromEntries(
      Object.entries(s.socials || {}).filter(
        ([key]) => s.socialVisibility?.[key] !== false,
      ),
    ),
    socialVisibility: s.socialVisibility || {},
    slideSeconds: s.slideSeconds,
    commissionPercent: s.commissionPercent,
    banners: db
      .prepare(
        "SELECT id,title,image,link FROM banners WHERE active=1 AND starts_at<=? AND ends_at>=? ORDER BY position,rowid DESC LIMIT 30",
      )
      .all(now(), now()),
  };
}
export function attachExperience(
  app,
  db,
  config,
  { auth, csrf, permission, asyncRoute, pageRows },
) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 },
  });
  app.get(
    "/api/media/:id",
    asyncRoute((req, res) => {
      if (!/^[a-f0-9]{32}$/.test(req.params.id)) fail(404, "ไม่พบรูปภาพ");
      const m = db
        .prepare("SELECT mime,body FROM media WHERE id=?")
        .get(req.params.id);
      if (!m) fail(404, "ไม่พบรูปภาพ");
      res
        .set({
          "Content-Type": m.mime,
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff",
        })
        .send(Buffer.from(m.body));
    }),
  );
  app.post(
    "/api/admin/media/:kind",
    auth,
    csrf,
    (req, res, next) => {
      const guide = IMAGE_GUIDES[req.params.kind];
      if (!guide) return res.status(400).json({ error: "ประเภทภาพไม่ถูกต้อง" });
      return permission(guide.permission)(req, res, next);
    },
    upload.single("image"),
    asyncRoute(async (req, res) => {
      const file = req.file,
        kind = req.params.kind;
      if (
        !file ||
        !["image/png", "image/jpeg"].includes(file.mimetype) ||
        !/^.+\.(png|jpe?g)$/i.test(file.originalname)
      )
        fail(400, "ใช้ไฟล์ .png, .jpeg หรือ .jpg ขนาดไม่เกิน 5 MB");
      let result;
      try {
        const image = sharp(file.buffer, {
            limitInputPixels: 24000000,
            animated: false,
            failOn: "warning",
          }),
          meta = await image.metadata();
        if (
          !["png", "jpeg"].includes(meta.format) ||
          meta.pages > 1 ||
          !meta.width ||
          !meta.height ||
          meta.width > 6000 ||
          meta.height > 6000 ||
          meta.width < 16 ||
          meta.height < 16 ||
          (meta.format === "png" && file.mimetype !== "image/png") ||
          (meta.format === "jpeg" && file.mimetype !== "image/jpeg")
        )
          throw new Error("bad format");
        if (kind === "favicon" && meta.width !== meta.height)
          fail(400, "Favicon ต้องเป็นสี่เหลี่ยมจัตุรัส แนะนำ 256 × 256 px");
        let pipe = image.rotate();
        if (kind === "favicon") pipe = pipe.resize(256, 256);
        else
          pipe = pipe.resize({
            width: 2400,
            height: 2400,
            fit: "inside",
            withoutEnlargement: true,
          });
        result = await pipe.png().toBuffer({ resolveWithObject: true });
      } catch (e) {
        if (e.status) throw e;
        fail(
          400,
          "ไฟล์ภาพไม่สมบูรณ์หรือชนิดไม่ตรง ใช้ PNG/JPEG จริง ขนาด 16–6000 px",
        );
      }
      const hasTransparency =
        kind === "favicon"
          ? !(await sharp(result.data).stats()).isOpaque
          : undefined;
      const mid = id();
      const settings = getSettings(db);
      const accountId =
        typeof req.query.accountId === "string" ? req.query.accountId : "";
      const selected = accountId
        ? merchantAccounts(settings).find((a) => a.id === accountId)
        : null;
      if (kind === "paymentQr" && accountId && !selected)
        fail(404, "ไม่พบบัญชีร้านค้า");
      if (
        kind === "paymentQr" &&
        Array.isArray(settings.merchantAccounts) &&
        !selected
      )
        fail(409, "เลือกบัญชีร้านค้าก่อนอัปโหลด QR");
      const targetSettings = selected
        ? accountReceiver(settings, selected)
        : settings;
      const receiver = receivingAccountKey(targetSettings);
      const verification =
        kind === "paymentQr"
          ? await verifyPaymentQr(db, config, result.data, targetSettings)
          : null;
      transaction(db, () => {
        if (
          verification &&
          (receiver !==
            receivingAccountKey(
              selected
                ? accountReceiver(
                    getSettings(db),
                    merchantAccounts(getSettings(db)).find(
                      (a) => a.id === accountId,
                    ),
                  )
                : getSettings(db),
            ) ||
            verification.credentialHash !==
              hash(secret(db, "easyslipApiKey", config)))
        )
          fail(409, "บัญชีรับเงินเปลี่ยนระหว่างตรวจสอบ กรุณาอัปโหลดใหม่");
        const bytes = db
          .prepare("SELECT COALESCE(SUM(bytes),0) n FROM media")
          .get().n;
        if (
          bytes + result.data.length >
          (config.mediaMaxBytes || 250 * 1024 * 1024)
        )
          fail(409, "พื้นที่รูปภาพเต็ม กรุณาติดต่อผู้ดูแล");
        const recent = db
          .prepare(
            "SELECT COUNT(*) n FROM media WHERE actor_id=? AND created_at>?",
          )
          .get(req.user.id, new Date(Date.now() - 3600000).toISOString()).n;
        if (recent >= 60) fail(429, "อัปโหลดได้สูงสุด 60 รูปต่อชั่วโมง");
        db.prepare("INSERT INTO media VALUES(?,?,?,?,?,?,?,?,?)").run(
          mid,
          kind,
          "image/png",
          result.info.width,
          result.info.height,
          result.data.length,
          result.data,
          req.user.id,
          now(),
        );
        audit(db, req.user.id, "media.uploaded", mid, {
          kind,
          width: result.info.width,
          height: result.info.height,
          bytes: result.data.length,
        });
        if (verification) {
          db.prepare("INSERT INTO payment_qr_checks VALUES(?,?,?)").run(
            mid,
            receiver,
            JSON.stringify(verification),
          );
          audit(db, req.user.id, "payment_qr.verified", mid, {
            bankAccountId: verification.bankAccountId,
            promptpayAccountId: verification.promptpayAccountId,
          });
        }
      });
      res.status(201).json({
        url: "/api/media/" + mid,
        width: result.info.width,
        height: result.info.height,
        ...(kind === "favicon" ? { hasTransparency } : {}),
        ...(verification
          ? {
              verified: true,
              message:
                "ตรวจสอบเลขพร้อมเพย์ ชื่อผู้รับ และบัญชีที่เชื่อม Branch แล้ว",
            }
          : {}),
        recommended: IMAGE_GUIDES[kind],
      });
    }),
  );
  app.get(
    "/api/admin/commissions/settings",
    auth,
    permission("settings"),
    asyncRoute((req, res) =>
      res.json({ commissionPercent: getSettings(db).commissionPercent }),
    ),
  );
  app.put(
    "/api/admin/commissions/settings",
    auth,
    csrf,
    permission("settings"),
    asyncRoute((req, res) => {
      const v = z
        .object({
          commissionPercent: commissionRateSchema,
        })
        .strict()
        .parse(req.body);
      transaction(db, () => {
        const previousPercent = getSettings(db).commissionPercent;
        setSetting(db, "commissionPercent", v.commissionPercent);
        audit(db, req.user.id, "commission.settings.updated", "shop", {
          previousPercent,
          commissionPercent: v.commissionPercent,
        });
      });
      res.json(v);
    }),
  );
  app.get(
    "/api/admin/appearance",
    auth,
    permission("appearance"),
    asyncRoute((req, res) => {
      const s = getSettings(db);
      res.json({
        theme: s.theme,
        logo: s.logo,
        favicon: s.favicon,
        slideSeconds: s.slideSeconds,
        ...(hasPermission(req.user, "settings")
          ? { commissionPercent: s.commissionPercent }
          : {}),
        imageGuides: IMAGE_GUIDES,
      });
    }),
  );
  app.put(
    "/api/admin/appearance",
    auth,
    csrf,
    permission("appearance"),
    asyncRoute((req, res) => {
      // Allow the read-only guide metadata returned by GET for existing clients;
      // it is never a writable setting. Reject every other unknown field.
      const v = appearanceSchema
        .extend({ imageGuides: z.unknown().optional() })
        .parse(req.body);
      delete v.imageGuides;
      if (
        v.commissionPercent !== undefined &&
        !hasPermission(req.user, "settings")
      )
        fail(403, "เจ้าของร้านเท่านั้นที่เปลี่ยนค่าคอมมิชชั่นได้");
      checkMedia(db, v.logo, "logo");
      checkMedia(db, v.favicon, "favicon");
      transaction(db, () => {
        for (const [k, value] of Object.entries(v)) setSetting(db, k, value);
        audit(db, req.user.id, "appearance.updated", "shop", {
          theme: v.theme,
          commissionPercent: v.commissionPercent,
          slideSeconds: v.slideSeconds,
        });
      });
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/admin/banners",
    auth,
    permission("banners"),
    asyncRoute((req, res) =>
      res.json(
        pageRows(
          db,
          "SELECT * FROM banners ORDER BY position,rowid DESC",
          [],
          req,
        ),
      ),
    ),
  );
  for (const method of ["post", "put"])
    app[method](
      "/api/admin/banners" + (method === "put" ? "/:id" : ""),
      auth,
      csrf,
      permission("banners"),
      asyncRoute((req, res) => {
        const v = bannerSchema.parse(req.body);
        checkMedia(db, v.image, "banner");
        const bid = method === "put" ? req.params.id : id();
        transaction(db, () => {
          if (method === "post")
            db.prepare(
              "INSERT INTO banners(id,title,image,link,position,active,starts_at,ends_at) VALUES(?,?,?,?,?,?,?,?)",
            ).run(
              bid,
              v.title,
              v.image,
              v.link,
              v.position,
              Number(v.active),
              v.starts_at,
              v.ends_at,
            );
          else {
            if (!v.version) fail(400, "กรุณาโหลดข้อมูลใหม่");
            const update = db
              .prepare(
                "UPDATE banners SET title=?,image=?,link=?,position=?,active=?,starts_at=?,ends_at=?,version=version+1 WHERE id=? AND version=?",
              )
              .run(
                v.title,
                v.image,
                v.link,
                v.position,
                Number(v.active),
                v.starts_at,
                v.ends_at,
                bid,
                v.version,
              );
            if (!update.changes) fail(409, "ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใหม่");
          }
          audit(
            db,
            req.user.id,
            "banner." + (method === "post" ? "created" : "updated"),
            bid,
          );
        });
        res.status(method === "post" ? 201 : 200).json({ id: bid });
      }),
    );
  app.get(
    "/api/coupons",
    auth,
    asyncRoute((req, res) =>
      res.json(
        pageRows(
          db,
          `SELECT p.id,p.code,p.title,p.description,p.image,p.type,p.value,p.minimum,p.starts_at,p.ends_at,p.claim_required,c.created_at claimed_at, (SELECT COUNT(*) FROM orders o WHERE o.promotion_id=p.id AND o.user_id=? AND o.status!='cancelled') used_count,p.per_user,p.limit_count,(SELECT COUNT(*) FROM orders o WHERE o.promotion_id=p.id AND o.status!='cancelled') total_used FROM promotions p LEFT JOIN coupon_claims c ON c.promotion_id=p.id AND c.user_id=? WHERE p.active=1 AND p.starts_at<=? AND p.ends_at>=? ORDER BY p.ends_at,p.rowid DESC`,
          [req.user.id, req.user.id, now(), now()],
          req,
        ),
      ),
    ),
  );
  app.get(
    "/api/promotions",
    asyncRoute((req, res) =>
      res.json(
        pageRows(
          db,
          "SELECT id,code,title,description,image,type,value,minimum,starts_at,ends_at,claim_required FROM promotions WHERE active=1 AND starts_at<=? AND ends_at>=? ORDER BY rowid DESC",
          [now(), now()],
          req,
        ),
      ),
    ),
  );
  app.post(
    "/api/coupons/:id/claim",
    auth,
    csrf,
    asyncRoute((req, res) => {
      transaction(db, () => {
        const p = db
          .prepare(
            "SELECT * FROM promotions WHERE id=? AND active=1 AND starts_at<=? AND ends_at>=?",
          )
          .get(req.params.id, now(), now());
        if (!p) fail(404, "คูปองนี้หมดอายุหรือปิดรับแล้ว");
        const used = db
          .prepare(
            "SELECT COUNT(*) n FROM orders WHERE promotion_id=? AND status!='cancelled'",
          )
          .get(p.id).n;
        if (used >= p.limit_count) fail(409, "คูปองถูกใช้ครบแล้ว");
        const r = db
          .prepare("INSERT OR IGNORE INTO coupon_claims VALUES(?,?,?)")
          .run(req.user.id, p.id, now());
        if (r.changes) audit(db, req.user.id, "coupon.claimed", p.id);
      });
      res.json({ ok: true });
    }),
  );
}
