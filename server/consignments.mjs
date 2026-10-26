import multer from "multer";
import sharp from "sharp";
import { z } from "zod";
import { id, now, transaction, audit, getSettings, setSetting } from "./db.mjs";
import { fail, money } from "./commerce.mjs";
import { hasPermission } from "../shared/authorization.mjs";
import { productDto } from "./product-images.mjs";
import { shopProfileFields, checkOwnedProfileImage } from "./profile-media.mjs";
import {
  notifyMembershipRequest,
  notifyProductRequest,
  notifyMembershipDecision,
  notifyProductDecision,
  resolveApprovalNotices,
} from "./notifications.mjs";
const productSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  category: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine((v) => v !== "__new_category__", "กรุณาระบุชื่อหมวดหมู่"),
  price: money.refine((n) => n > 0),
  stock: z.number().int().min(0).max(100000),
  image: z.string().regex(/^\/api\/media\/[a-f0-9]{32}$/),
  images: z
    .array(z.string().regex(/^\/api\/media\/[a-f0-9]{32}$/))
    .min(1)
    .max(8)
    .refine((images) => new Set(images).size === images.length, "รูปภาพซ้ำ")
    .optional(),
  version: z.number().int().positive().optional(),
});
const approved = (db, uid) => {
  if (
    db.prepare("SELECT status FROM consignors WHERE user_id=?").get(uid)
      ?.status !== "approved"
  )
    fail(403, "ต้องได้รับอนุมัติเป็นตัวแทนฝากขายก่อน");
};
const productPage = (result) => ({
  ...result,
  items: result.items.map(productDto),
});
export function attachConsignments(
  app,
  db,
  config,
  { auth, csrf, permission, asyncRoute, pageRows },
) {
  app.get(
    "/api/consignment",
    auth,
    asyncRoute((req, res) => {
      const membership =
        db
          .prepare("SELECT * FROM consignors WHERE user_id=?")
          .get(req.user.id) || null;
      const defaultFeePercent = getSettings(db).consignmentFeePercent;
      res.json({
        membership,
        feePercent:
          membership?.fee_bps != null
            ? membership.fee_bps / 100
            : defaultFeePercent,
        defaultFeePercent,
        totals: db
          .prepare(
            "SELECT COALESCE(SUM(CASE WHEN status='pending' THEN net ELSE 0 END),0) pending,COALESCE(SUM(CASE WHEN status='credited' THEN net ELSE 0 END),0) credited,COALESCE(SUM(CASE WHEN status='credited' THEN fee ELSE 0 END),0) fees FROM consignment_sales WHERE seller_id=?",
          )
          .get(req.user.id),
      });
    }),
  );
  app.post(
    "/api/consignment/apply",
    auth,
    csrf,
    asyncRoute((req, res) => {
      const v = z
        .object({
          shopName: z.string().trim().min(2).max(100),
          acceptTerms: z.literal(true),
          ...shopProfileFields,
        })
        .strict()
        .parse(req.body);
      transaction(db, () => {
        const old = db
          .prepare("SELECT * FROM consignors WHERE user_id=?")
          .get(req.user.id);
        if (old)
          fail(409, "มีคำขอสมัครแล้ว กรุณาติดต่อร้านหากต้องการเปลี่ยนสถานะ");
        checkOwnedProfileImage(db, v.image, "shop", req.user.id);
        checkOwnedProfileImage(db, v.logo, "shopLogo", req.user.id);
        db.prepare(
          "INSERT INTO consignors(user_id,shop_name,status,created_at,updated_at,image,service_area,logo) VALUES(?,?,?,?,?,?,?,?)",
        ).run(
          req.user.id,
          v.shopName,
          "pending",
          now(),
          now(),
          v.image,
          v.serviceArea,
          v.logo,
        );
        audit(db, req.user.id, "consignment.applied", req.user.id);
        notifyMembershipRequest(db, req.user.id, v.shopName);
      });
      res.status(201).json({ ok: true });
    }),
  );
  app.get(
    "/api/consignment/product-categories",
    auth,
    asyncRoute((req, res) => {
      approved(db, req.user.id);
      res.json(
        db
          .prepare(
            "SELECT DISTINCT category FROM products WHERE category!='' AND (active=1 OR consignor_id=?) ORDER BY category LIMIT 500",
          )
          .all(req.user.id)
          .map((r) => r.category),
      );
    }),
  );
  app.get(
    "/api/consignment/products",
    auth,
    asyncRoute((req, res) =>
      res.json(
        productPage(
          pageRows(
            db,
            "SELECT id,name,description,category,price,stock,image,images,active,version,consignment_status FROM products WHERE consignor_id=? AND name LIKE ? ORDER BY created_at DESC",
            [req.user.id, "%" + String(req.query.q || "").slice(0, 100) + "%"],
            req,
          ),
        ),
      ),
    ),
  );
  app.get(
    "/api/consignment/sales",
    auth,
    asyncRoute((req, res) =>
      res.json(
        pageRows(
          db,
          "SELECT c.*,i.name,i.quantity FROM consignment_sales c JOIN order_items i ON i.order_id=c.order_id AND i.product_id=c.product_id WHERE c.seller_id=? ORDER BY c.created_at DESC",
          [req.user.id],
          req,
        ),
      ),
    ),
  );
  for (const method of ["post", "put"])
    app[method](
      "/api/consignment/products" + (method === "put" ? "/:id" : ""),
      auth,
      csrf,
      asyncRoute((req, res) => {
        const v = productSchema.parse(req.body);
        transaction(db, () => {
          approved(db, req.user.id);
          const old =
            method === "put"
              ? db
                  .prepare(
                    "SELECT * FROM products WHERE id=? AND consignor_id=?",
                  )
                  .get(req.params.id, req.user.id)
              : null;
          if (method === "put" && !old) fail(404, "ไม่พบสินค้าฝากขายของคุณ");
          if (old && old.version !== v.version)
            fail(409, "สินค้าเปลี่ยนแล้ว กรุณาโหลดใหม่");
          const uploadedImages = v.images || [v.image];
          // Owners may retain images already attached by an authorized product admin.
          // New references must come from this seller's own product uploads.
          const existingImages = new Set(old ? productDto(old).images : []);
          if (v.images && v.image !== v.images[0])
            fail(400, "รูปหลักต้องเป็นรูปแรกของชุดรูปภาพ");
          for (const image of uploadedImages)
            if (
              !existingImages.has(image) &&
              !db
                .prepare(
                  "SELECT id FROM media WHERE id=? AND kind='product' AND actor_id=?",
                )
                .get(image.split("/").at(-1), req.user.id)
            )
              fail(400, "กรุณาอัปโหลดรูปสินค้าของคุณผ่านระบบ");
          if (
            !old &&
            db
              .prepare("SELECT COUNT(*) n FROM products WHERE consignor_id=?")
              .get(req.user.id).n >= 200
          )
            fail(409, "ฝากขายได้สูงสุด 200 สินค้าต่อตัวแทน");
          const pid = old?.id || id();
          const gallery = v.images
            ? JSON.stringify(v.images)
            : old?.image === v.image
              ? old.images
              : "[]";
          if (old)
            db.prepare(
              "UPDATE products SET name=?,description=?,category=?,price=?,stock=?,images=?,image=?,active=0,consignment_status='pending',version=version+1 WHERE id=? AND consignor_id=?",
            ).run(
              v.name,
              v.description,
              v.category,
              v.price,
              v.stock,
              gallery,
              v.image,
              pid,
              req.user.id,
            );
          else
            db.prepare(
              "INSERT INTO products(id,name,description,category,price,cost,stock,image,images,active,created_at,consignor_id,consignment_status) VALUES(?,?,?,?,?,0,?,?,?,0,?,?,'pending')",
            ).run(
              pid,
              v.name,
              v.description,
              v.category,
              v.price,
              v.stock,
              v.image,
              gallery,
              now(),
              req.user.id,
            );
          audit(
            db,
            req.user.id,
            old
              ? "consignment.product_updated"
              : "consignment.product_submitted",
            pid,
          );
          notifyProductRequest(
            db,
            db
              .prepare(
                "SELECT id,name,version,consignor_id FROM products WHERE id=?",
              )
              .get(pid),
          );
        });
        res.status(method === "post" ? 201 : 200).json({ ok: true });
      }),
    );
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 },
  }).single("image");
  app.post(
    "/api/consignment/media",
    auth,
    csrf,
    (req, res, next) => {
      try {
        approved(db, req.user.id);
        upload(req, res, (e) =>
          e
            ? res
                .status(400)
                .json({ error: "ใช้รูปไม่เกิน 5 MB ครั้งละ 1 ไฟล์" })
            : next(),
        );
      } catch (e) {
        next(e);
      }
    },
    asyncRoute(async (req, res) => {
      const f = req.file;
      if (
        !f ||
        !["image/png", "image/jpeg"].includes(f.mimetype) ||
        !/^.+\.(png|jpe?g)$/i.test(f.originalname)
      )
        fail(400, "ใช้ PNG/JPG/JPEG ไม่เกิน 5 MB");
      let out;
      try {
        const image = sharp(f.buffer, {
            limitInputPixels: 24000000,
            failOn: "warning",
          }),
          meta = await image.metadata();
        if (
          !["png", "jpeg"].includes(meta.format) ||
          meta.pages > 1 ||
          meta.width < 16 ||
          meta.height < 16 ||
          (meta.format === "png") !== (f.mimetype === "image/png")
        )
          throw Error("format");
        out = await image
          .rotate()
          .resize({
            width: 1600,
            height: 1600,
            fit: "inside",
            withoutEnlargement: true,
          })
          .png()
          .toBuffer({ resolveWithObject: true });
      } catch {
        fail(422, "รูปภาพเสียหายหรือชนิดไฟล์ไม่ตรง");
      }
      const mid = id();
      transaction(db, () => {
        approved(db, req.user.id);
        if (
          db
            .prepare(
              "SELECT COUNT(*) n FROM media WHERE actor_id=? AND created_at>?",
            )
            .get(req.user.id, new Date(Date.now() - 3600000).toISOString()).n >=
          30
        )
          fail(429, "อัปโหลดได้สูงสุด 30 รูปต่อชั่วโมง");
        if (
          db.prepare("SELECT COALESCE(SUM(bytes),0) n FROM media").get().n +
            out.data.length >
          (config.mediaMaxBytes || 250 * 1024 * 1024)
        )
          fail(409, "พื้นที่ภาพเต็ม กรุณาติดต่อร้าน");
        db.prepare("INSERT INTO media VALUES(?,?,?,?,?,?,?,?,?)").run(
          mid,
          "product",
          "image/png",
          out.info.width,
          out.info.height,
          out.data.length,
          out.data,
          req.user.id,
          now(),
        );
        audit(db, req.user.id, "consignment.media_uploaded", mid);
      });
      res.status(201).json({
        url: "/api/media/" + mid,
        width: out.info.width,
        height: out.info.height,
      });
    }),
  );
  app.get(
    "/api/admin/consignments",
    permission("consignments"),
    asyncRoute((req, res) =>
      res.json({
        ...pageRows(
          db,
          "SELECT c.*,u.name,u.email,u.phone FROM consignors c JOIN users u ON u.id=c.user_id WHERE c.shop_name LIKE ? OR u.name LIKE ? ORDER BY c.created_at DESC",
          Array(2).fill("%" + String(req.query.q || "").slice(0, 100) + "%"),
          req,
        ),
        defaultFeePercent: getSettings(db).consignmentFeePercent,
      }),
    ),
  );
  app.put(
    "/api/admin/consignments/:id",
    permission("consignments"),
    asyncRoute((req, res) => {
      const v = z
        .object({
          status: z.enum(["approved", "suspended", "rejected"]),
          note: z.string().trim().max(300),
          version: z.number().int().positive(),
          feePercent: z
            .number()
            .min(0)
            .max(100)
            .multipleOf(0.01)
            .nullable()
            .optional(),
        })
        .strict()
        .parse(req.body);
      if (v.feePercent !== undefined && !hasPermission(req.user, "settings"))
        fail(403, "เฉพาะผู้มีสิทธิ์ตั้งค่าระบบที่เปลี่ยนค่าฝากขายได้");
      transaction(db, () => {
        const previous = db
          .prepare("SELECT * FROM consignors WHERE user_id=?")
          .get(req.params.id);
        if (
          !db
            .prepare(
              "UPDATE consignors SET status=?,note=?,version=version+1,updated_at=? WHERE user_id=? AND version=?",
            )
            .run(v.status, v.note, now(), req.params.id, v.version).changes
        )
          fail(409, "ข้อมูลสมาชิกเปลี่ยนแล้ว กรุณาโหลดใหม่");
        if (v.status !== "approved")
          db.prepare(
            "UPDATE products SET active=0,version=version+1 WHERE consignor_id=?",
          ).run(req.params.id);
        if (v.feePercent !== undefined) {
          const feeBps =
            v.feePercent === null ? null : Math.round(v.feePercent * 100);
          db.prepare("UPDATE consignors SET fee_bps=? WHERE user_id=?").run(
            feeBps,
            req.params.id,
          );
          if (previous?.fee_bps !== feeBps)
            audit(
              db,
              req.user.id,
              "consignment.shop_fee_changed",
              req.params.id,
              { beforeBps: previous?.fee_bps ?? null, afterBps: feeBps },
            );
        }
        audit(
          db,
          req.user.id,
          "consignment.membership_changed",
          req.params.id,
          { status: v.status },
        );
        if (previous && previous.status !== v.status)
          notifyMembershipDecision(db, previous, v.status, v.version + 1);
      });
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/admin/consignment-products",
    permission("consignments"),
    asyncRoute((req, res) =>
      res.json(
        productPage(
          pageRows(
            db,
            "SELECT p.*,c.shop_name FROM products p JOIN consignors c ON c.user_id=p.consignor_id WHERE p.name LIKE ? ORDER BY p.created_at DESC",
            ["%" + String(req.query.q || "").slice(0, 100) + "%"],
            req,
          ),
        ),
      ),
    ),
  );
  app.put(
    "/api/admin/consignment-products/:id",
    permission("consignments"),
    asyncRoute((req, res) => {
      const v = z
        .object({ approved: z.boolean(), version: z.number().int().positive() })
        .parse(req.body);
      transaction(db, () => {
        const p = db
          .prepare(
            "SELECT * FROM products WHERE id=? AND consignor_id IS NOT NULL",
          )
          .get(req.params.id);
        if (!p) fail(404, "ไม่พบสินค้าฝากขาย");
        if (v.approved) approved(db, p.consignor_id);
        if (
          !db
            .prepare(
              "UPDATE products SET active=?,consignment_status=?,version=version+1 WHERE id=? AND version=?",
            )
            .run(
              +v.approved,
              v.approved ? "approved" : "rejected",
              p.id,
              v.version,
            ).changes
        )
          fail(409, "สินค้าเปลี่ยนแล้ว กรุณาโหลดใหม่");
        audit(db, req.user.id, "consignment.product_moderated", p.id, {
          approved: v.approved,
        });
        resolveApprovalNotices(db, "consignment.product", p.id);
        if (
          p.consignment_status !== (v.approved ? "approved" : "rejected") ||
          !!p.active !== v.approved
        )
          notifyProductDecision(db, p, v.approved, v.version + 1);
      });
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/admin/consignment-sales",
    permission("consignments"),
    asyncRoute((req, res) =>
      res.json(
        pageRows(
          db,
          "SELECT c.*,i.name,i.quantity,s.shop_name FROM consignment_sales c JOIN order_items i ON i.order_id=c.order_id AND i.product_id=c.product_id JOIN consignors s ON s.user_id=c.seller_id ORDER BY c.created_at DESC",
          [],
          req,
        ),
      ),
    ),
  );
  app.get(
    "/api/admin/consignment-settings",
    permission("settings"),
    asyncRoute((req, res) =>
      res.json({ feePercent: getSettings(db).consignmentFeePercent }),
    ),
  );
  app.put(
    "/api/admin/consignment-settings",
    permission("settings"),
    asyncRoute((req, res) => {
      const v = z
        .object({ feePercent: z.number().min(0).max(100).multipleOf(0.01) })
        .parse(req.body);
      transaction(db, () => {
        setSetting(db, "consignmentFeePercent", v.feePercent);
        audit(db, req.user.id, "consignment.fee_changed", "shop", {
          percent: v.feePercent,
        });
      });
      res.json({ ok: true });
    }),
  );
}
