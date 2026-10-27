import multer from "multer";
import sharp from "sharp";
import { z } from "zod";
import { id, now, audit, transaction } from "./db.mjs";
import { fail } from "./commerce.mjs";
import { hasPermission } from "../shared/authorization.mjs";

const imagePath = z.union([
  z.literal(""),
  z.string().regex(/^\/api\/media\/[a-f0-9]{32}$/),
]);
export const shopProfileFields = {
  image: imagePath.default(""),
  logo: imagePath.default(""),
  serviceArea: z.string().trim().max(1000).default(""),
};
export function checkOwnedProfileImage(db, image, kind, userId) {
  if (
    image &&
    !db
      .prepare("SELECT id FROM media WHERE id=? AND kind=? AND actor_id=?")
      .get(image.split("/").at(-1), kind, userId)
  )
    fail(400, "กรุณาอัปโหลดรูปของคุณผ่านช่องอัปโหลดนี้");
}

// Drafts remain private. Only the currently published shop picture is public.
export function canReadProfileMedia(db, media, user) {
  if (user?.id === media.actor_id) return true;
  const path = "/api/media/" + media.id;
  if (media.kind === "avatar")
    return (
      hasPermission(user, "members") &&
      !!db
        .prepare("SELECT id FROM users WHERE id=? AND avatar=?")
        .get(media.actor_id, path)
    );
  if (!["shop", "shopLogo"].includes(media.kind)) return false;
  const column = media.kind === "shopLogo" ? "logo" : "image";
  const shop = db
    .prepare(
      `SELECT c.status,u.active FROM consignors c JOIN users u ON u.id=c.user_id WHERE c.user_id=? AND c.${column}=?`,
    )
    .get(media.actor_id, path);
  return (
    !!shop &&
    ((shop.status === "approved" && shop.active === 1) ||
      hasPermission(user, "consignments"))
  );
}

export function publicProductShops(db, products) {
  if (!products.length) return products;
  const shops = db
    .prepare(
      `SELECT p.id,c.public_id,c.shop_name,c.image,c.logo FROM products p
    JOIN consignors c ON c.user_id=p.consignor_id JOIN users u ON u.id=c.user_id
    WHERE p.id IN (${products.map(() => "?").join(",")}) AND c.status='approved' AND u.active=1`,
    )
    .all(...products.map((p) => p.id));
  const byId = new Map(
    shops.map((s) => [
      s.id,
      {
        name: s.shop_name,
        image: s.image,
        logo: s.logo,
        id: s.public_id,
      },
    ]),
  );
  return products.map((p) =>
    byId.has(p.id) ? { ...p, shop: byId.get(p.id) } : p,
  );
}

export function attachProfileMedia(
  app,
  db,
  config,
  { auth, csrf, asyncRoute },
) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
  }).single("image");
  app.post(
    "/api/profile/media/:kind",
    auth,
    csrf,
    (req, res, next) => {
      if (!["avatar", "shop", "shopLogo"].includes(req.params.kind))
        return next(
          Object.assign(new Error("ประเภทภาพไม่ถูกต้อง"), { status: 400 }),
        );
      const recent = db
        .prepare(
          "SELECT COUNT(*) n FROM media WHERE actor_id=? AND kind IN ('avatar','shop','shopLogo') AND created_at>?",
        )
        .get(req.user.id, new Date(Date.now() - 3600000).toISOString()).n;
      if (recent >= 20)
        return next(
          Object.assign(
            new Error("อัปโหลดรูปโปรไฟล์และร้านได้รวม 20 รูปต่อชั่วโมง"),
            { status: 429 },
          ),
        );
      upload(req, res, (err) => {
        if (err instanceof multer.MulterError)
          return res
            .status(400)
            .json({ error: "แนบ PNG/JPEG ครั้งละ 1 รูป ขนาดไม่เกิน 5 MB" });
        next(err);
      });
    },
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
        });
        const meta = await image.metadata();
        if (
          !["png", "jpeg"].includes(meta.format) ||
          (meta.pages || 1) > 1 ||
          !meta.width ||
          !meta.height ||
          meta.width < 32 ||
          meta.height < 32 ||
          meta.width > 6000 ||
          meta.height > 6000 ||
          file.mimetype !==
            (meta.format === "png" ? "image/png" : "image/jpeg") ||
          !new RegExp(
            meta.format === "png" ? "\\.png$" : "\\.jpe?g$",
            "i",
          ).test(file.originalname)
        )
          throw new Error("format");
        const pipe = image.rotate();
        result = await (
          kind === "avatar"
            ? pipe.resize(512, 512, { fit: "cover" })
            : pipe.resize({
                width: kind === "shopLogo" ? 512 : 1200,
                height: kind === "shopLogo" ? 512 : 800,
                fit: "inside",
                withoutEnlargement: true,
              })
        )
          .png()
          .toBuffer({ resolveWithObject: true });
      } catch {
        fail(400, "ภาพไม่สมบูรณ์ ใช้ PNG/JPEG จริง ขนาด 32–6000 px");
      }
      const mid = id();
      transaction(db, () => {
        const recent = db
          .prepare(
            "SELECT COUNT(*) n FROM media WHERE actor_id=? AND kind IN ('avatar','shop','shopLogo') AND created_at>?",
          )
          .get(req.user.id, new Date(Date.now() - 3600000).toISOString()).n;
        if (recent >= 20)
          fail(429, "อัปโหลดรูปโปรไฟล์และร้านได้รวม 20 รูปต่อชั่วโมง");
        const bytes = db
          .prepare("SELECT COALESCE(SUM(bytes),0) n FROM media")
          .get().n;
        if (
          bytes + result.data.length >
          (config.mediaMaxBytes ?? 250 * 1024 * 1024)
        )
          fail(409, "พื้นที่รูปภาพเต็ม กรุณาติดต่อผู้ดูแล");
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
        audit(db, req.user.id, "profile.media_uploaded", mid, {
          kind,
          bytes: result.data.length,
        });
      });
      res.status(201).json({
        url: "/api/media/" + mid,
        width: result.info.width,
        height: result.info.height,
      });
    }),
  );
  app.put(
    "/api/account/photo",
    auth,
    csrf,
    asyncRoute((req, res) => {
      const v = z
        .object({ image: imagePath, version: z.number().int().positive() })
        .strict()
        .parse(req.body);
      transaction(db, () => {
        checkOwnedProfileImage(db, v.image, "avatar", req.user.id);
        const old = db
          .prepare("SELECT avatar,avatar_version FROM users WHERE id=?")
          .get(req.user.id);
        if (old.avatar_version !== v.version)
          fail(409, "รูปโปรไฟล์เปลี่ยนแล้ว กรุณาโหลดหน้าใหม่ก่อนบันทึก");
        db.prepare(
          "UPDATE users SET avatar=?,avatar_version=avatar_version+1 WHERE id=?",
        ).run(v.image, req.user.id);
        audit(db, req.user.id, "account.photo_updated", req.user.id, {
          before: old.avatar,
          after: v.image,
        });
      });
      res.json({ ok: true });
    }),
  );
  app.put(
    "/api/consignment/profile",
    auth,
    csrf,
    asyncRoute((req, res) => {
      const v = z
        .object({
          image: imagePath,
          logo: imagePath.optional(),
          serviceArea: z.string().trim().max(1000),
          version: z.number().int().positive(),
        })
        .strict()
        .parse(req.body);
      transaction(db, () => {
        const old = db
          .prepare("SELECT * FROM consignors WHERE user_id=?")
          .get(req.user.id);
        if (!old) fail(403, "กรุณาสมัครตัวแทนฝากขายก่อน");
        if (old.version !== v.version)
          fail(409, "ข้อมูลร้านเปลี่ยนแล้ว กรุณาโหลดหน้าใหม่ก่อนบันทึก");
        checkOwnedProfileImage(db, v.image, "shop", req.user.id);
        const logo = v.logo === undefined ? old.logo : v.logo;
        checkOwnedProfileImage(db, logo, "shopLogo", req.user.id);
        db.prepare(
          "UPDATE consignors SET image=?,logo=?,service_area=?,version=version+1,updated_at=? WHERE user_id=?",
        ).run(v.image, logo, v.serviceArea, now(), req.user.id);
        audit(db, req.user.id, "consignment.profile_updated", req.user.id, {
          before: {
            image: old.image,
            logo: old.logo,
            serviceArea: old.service_area,
          },
          after: { image: v.image, logo, serviceArea: v.serviceArea },
        });
      });
      res.json({ ok: true });
    }),
  );
}
