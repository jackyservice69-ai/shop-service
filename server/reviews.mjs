import multer from "multer";
import sharp from "sharp";
import { z } from "zod";
import { id, now, transaction, audit } from "./db.mjs";
import { fail } from "./commerce.mjs";
import { sanitizeReviewVideo } from "./review-video.mjs";

const eligible = (db, uid, pid) =>
  !!db
    .prepare(
      "SELECT 1 FROM order_items i JOIN orders o ON o.id=i.order_id JOIN products p ON p.id=i.product_id WHERE i.product_id=? AND o.user_id=? AND o.status='completed' AND o.paid=o.total AND (p.consignor_id IS NULL OR p.consignor_id!=?) LIMIT 1",
    )
    .get(pid, uid, uid);
const requireBuyer = (db, uid, pid) => {
  if (!eligible(db, uid, pid))
    fail(
      403,
      "รีวิวได้เฉพาะสินค้าที่ซื้อและรับสินค้าสำเร็จแล้ว และห้ามรีวิวสินค้าที่ตนฝากขาย",
    );
};
const filesFor = (db, rid) =>
  db
    .prepare(
      "SELECT id,mime,width,height,duration FROM review_media WHERE review_id=? ORDER BY created_at,id",
    )
    .all(rid)
    .map((m) => ({ ...m, url: "/api/review-media/" + m.id }));
const schema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(1, "กรุณาเขียนความคิดเห็น").max(2000),
  mediaIds: z
    .array(z.string().regex(/^[a-f0-9]{32}$/))
    .max(5)
    .default([])
    .refine((a) => new Set(a).size === a.length, "ไฟล์แนบซ้ำ"),
  version: z.number().int().positive().optional(),
});
export function attachReviews(
  app,
  db,
  config,
  { auth, csrf, permission, asyncRoute, pageRows },
) {
  app.get(
    "/api/products/:id/reviews",
    asyncRoute((req, res) => {
      if (!db.prepare("SELECT id FROM products WHERE id=?").get(req.params.id))
        fail(404, "ไม่พบสินค้า");
      const rows = pageRows(
        db,
        "SELECT r.id,r.rating,r.comment,r.created_at,r.updated_at,COALESCE(NULLIF(u.first_name,''),u.name) author FROM reviews r JOIN users u ON u.id=r.user_id WHERE r.product_id=? AND r.visible=1 ORDER BY r.created_at DESC,r.id DESC",
        [req.params.id],
        req,
      );
      rows.items = rows.items.map((r) => ({
        ...r,
        author: r.author.split(/\s/)[0].slice(0, 40),
        media: filesFor(db, r.id),
      }));
      const summary = db
        .prepare(
          "SELECT COUNT(*) count,COALESCE(AVG(rating),0) average FROM reviews WHERE product_id=? AND visible=1",
        )
        .get(req.params.id);
      res.json({
        ...rows,
        summary,
        distribution: db
          .prepare(
            "SELECT rating,COUNT(*) count FROM reviews WHERE product_id=? AND visible=1 GROUP BY rating ORDER BY rating DESC",
          )
          .all(req.params.id),
      });
    }),
  );
  app.get(
    "/api/products/:id/reviews/me",
    auth,
    asyncRoute((req, res) => {
      const row = db
        .prepare("SELECT * FROM reviews WHERE product_id=? AND user_id=?")
        .get(req.params.id, req.user.id);
      res.json({
        eligible: eligible(db, req.user.id, req.params.id),
        review: row ? { ...row, media: filesFor(db, row.id) } : null,
      });
    }),
  );
  app.put(
    "/api/products/:id/review",
    auth,
    csrf,
    asyncRoute((req, res) => {
      const v = schema.parse(req.body),
        uid = req.user.id,
        pid = req.params.id;
      transaction(db, () => {
        requireBuyer(db, uid, pid);
        const old = db
          .prepare("SELECT * FROM reviews WHERE user_id=? AND product_id=?")
          .get(uid, pid);
        if (old && v.version !== old.version)
          fail(409, "รีวิวเปลี่ยนแล้ว กรุณาโหลดใหม่ก่อนแก้ไข");
        if (!old && v.version) fail(409, "รีวิวถูกลบแล้ว กรุณาโหลดใหม่");
        const media = v.mediaIds.map((mid) =>
          db
            .prepare(
              "SELECT * FROM review_media WHERE id=? AND user_id=? AND product_id=?",
            )
            .get(mid, uid, pid),
        );
        if (media.some((m) => !m || (m.review_id && m.review_id !== old?.id)))
          fail(400, "ไฟล์แนบไม่ใช่ของคุณหรือไม่ตรงกับสินค้านี้");
        if (media.filter((m) => m.mime.startsWith("video/")).length > 1)
          fail(400, "แนบวิดีโอได้สูงสุด 1 ไฟล์ต่อรีวิว");
        const rid = old?.id || id();
        if (old)
          db.prepare(
            "UPDATE reviews SET rating=?,comment=?,version=version+1,updated_at=? WHERE id=?",
          ).run(v.rating, v.comment, now(), rid);
        else
          db.prepare(
            "INSERT INTO reviews(id,product_id,user_id,rating,comment,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
          ).run(rid, pid, uid, v.rating, v.comment, now(), now());
        // Removed media are deleted rather than left publicly accessible.
        for (const m of db
          .prepare("SELECT id FROM review_media WHERE review_id=?")
          .all(rid))
          if (!v.mediaIds.includes(m.id))
            db.prepare("DELETE FROM review_media WHERE id=?").run(m.id);
        for (const m of media)
          db.prepare("UPDATE review_media SET review_id=? WHERE id=?").run(
            rid,
            m.id,
          );
        audit(db, uid, old ? "review.updated" : "review.created", rid, {
          rating: v.rating,
          attachments: media.length,
        });
      });
      res.json({ ok: true });
    }),
  );
  app.delete(
    "/api/products/:id/review",
    auth,
    csrf,
    asyncRoute((req, res) => {
      transaction(db, () => {
        const r = db
          .prepare("SELECT * FROM reviews WHERE user_id=? AND product_id=?")
          .get(req.user.id, req.params.id);
        if (!r) fail(404, "ไม่พบรีวิว");
        if (req.body.version !== r.version)
          fail(409, "รีวิวเปลี่ยนแล้ว กรุณาโหลดใหม่");
        db.prepare("DELETE FROM review_media WHERE review_id=?").run(r.id);
        db.prepare("DELETE FROM reviews WHERE id=?").run(r.id);
        audit(db, req.user.id, "review.deleted", r.id);
      });
      res.json({ ok: true });
    }),
  );
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024, files: 1, fields: 0 },
  }).single("file");
  app.post(
    "/api/products/:id/review-media",
    auth,
    csrf,
    asyncRoute((req, res, next) => {
      requireBuyer(db, req.user.id, req.params.id);
      db.prepare(
        "DELETE FROM review_media WHERE review_id IS NULL AND created_at<?",
      ).run(new Date(Date.now() - 86400000).toISOString());
      if (
        db
          .prepare(
            "SELECT COUNT(*) n FROM audit WHERE actor_id=? AND action='review.media_uploaded' AND created_at>?",
          )
          .get(req.user.id, new Date(Date.now() - 3600000).toISOString()).n >=
        20
      )
        fail(429, "อัปโหลดรีวิวได้สูงสุด 20 ไฟล์ต่อชั่วโมง");
      if (
        db
          .prepare(
            "SELECT COUNT(*) n FROM review_media WHERE user_id=? AND review_id IS NULL",
          )
          .get(req.user.id).n >= 10
      )
        fail(409, "มีไฟล์รอบันทึกมากเกินไป กรุณาบันทึกรีวิวหรือลบไฟล์ก่อน");
      upload(req, res, (e) =>
        e
          ? res
              .status(400)
              .json({ error: "แนบได้ครั้งละ 1 ไฟล์ ไม่เกิน 50 MB" })
          : next(),
      );
    }),
    asyncRoute(async (req, res) => {
      const file = req.file;
      if (!file) fail(400, "กรุณาเลือกไฟล์");
      let m;
      if (/^image\//.test(file.mimetype)) {
        if (
          !["image/png", "image/jpeg"].includes(file.mimetype) ||
          !/^.+\.(png|jpe?g)$/i.test(file.originalname) ||
          file.size > 5 * 1024 * 1024
        )
          fail(400, "รูปใช้ PNG/JPG/JPEG ไม่เกิน 5 MB");
        try {
          const source = sharp(file.buffer, {
              limitInputPixels: 24000000,
              failOn: "warning",
            }),
            meta = await source.metadata();
          if (
            !["png", "jpeg"].includes(meta.format) ||
            meta.pages > 1 ||
            meta.width < 16 ||
            meta.height < 16 ||
            (meta.format === "png") !== (file.mimetype === "image/png")
          )
            throw Error("format");
          const r = await source
            .rotate()
            .resize({
              width: 1600,
              height: 1600,
              fit: "inside",
              withoutEnlargement: true,
            })
            .png()
            .toBuffer({ resolveWithObject: true });
          m = {
            body: r.data,
            mime: "image/png",
            width: r.info.width,
            height: r.info.height,
            duration: 0,
          };
        } catch {
          fail(422, "รูปภาพเสียหายหรือชนิดไฟล์ไม่ตรง");
        }
      } else {
        const mp4 =
          file.mimetype === "video/mp4" &&
          /\.mp4$/i.test(file.originalname) &&
          file.buffer.subarray(4, 8).toString() === "ftyp";
        const webm =
          file.mimetype === "video/webm" &&
          /\.webm$/i.test(file.originalname) &&
          file.buffer
            .subarray(0, 4)
            .equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
        if (!mp4 && !webm)
          fail(400, "วิดีโอใช้ MP4/WebM จริง ขนาดไม่เกิน 50 MB");
        m = await sanitizeReviewVideo(file.buffer, config);
      }
      const mid = id();
      transaction(db, () => {
        requireBuyer(db, req.user.id, req.params.id);
        if (
          db
            .prepare(
              "SELECT COUNT(*) n FROM review_media WHERE user_id=? AND review_id IS NULL",
            )
            .get(req.user.id).n >= 10
        )
          fail(409, "มีไฟล์รอบันทึกมากเกินไป กรุณาบันทึกหรือลบไฟล์ก่อน");
        if (
          db
            .prepare(
              "SELECT COUNT(*) n FROM audit WHERE actor_id=? AND action='review.media_uploaded' AND created_at>?",
            )
            .get(req.user.id, new Date(Date.now() - 3600000).toISOString()).n >=
          20
        )
          fail(429, "อัปโหลดได้สูงสุด 20 ไฟล์ต่อชั่วโมง");
        if (
          db.prepare("SELECT COALESCE(SUM(bytes),0) n FROM review_media").get()
            .n +
            m.body.length >
          (config.reviewMediaMaxBytes || 500 * 1024 * 1024)
        )
          fail(409, "พื้นที่สื่อรีวิวเต็ม กรุณาติดต่อร้าน");
        db.prepare(
          "INSERT INTO review_media(id,user_id,product_id,mime,width,height,duration,bytes,body,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
        ).run(
          mid,
          req.user.id,
          req.params.id,
          m.mime,
          m.width,
          m.height,
          m.duration,
          m.body.length,
          m.body,
          now(),
        );
        audit(db, req.user.id, "review.media_uploaded", mid, {
          mime: m.mime,
          bytes: m.body.length,
        });
      });
      res.status(201).json({
        id: mid,
        mime: m.mime,
        width: m.width,
        height: m.height,
        duration: m.duration,
        url: "/api/review-media/" + mid,
      });
    }),
  );
  app.delete(
    "/api/review-media/:id",
    auth,
    csrf,
    asyncRoute((req, res) => {
      const m = db
        .prepare(
          "SELECT * FROM review_media WHERE id=? AND user_id=? AND review_id IS NULL",
        )
        .get(req.params.id, req.user.id);
      if (!m) fail(404, "ไม่พบไฟล์รอบันทึก");
      db.prepare("DELETE FROM review_media WHERE id=?").run(m.id);
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/review-media/:id",
    asyncRoute((req, res) => {
      const m = db
        .prepare(
          "SELECT m.*,r.visible FROM review_media m LEFT JOIN reviews r ON r.id=m.review_id WHERE m.id=?",
        )
        .get(req.params.id);
      const ps = JSON.parse(req.user?.permissions || "[]");
      if (
        !m ||
        !(
          m.visible === 1 ||
          m.user_id === req.user?.id ||
          ps.includes("*") ||
          ps.includes("reviews")
        )
      )
        fail(404, "ไม่พบไฟล์รีวิว");
      res.set({
        "Content-Type": m.mime,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Accept-Ranges": "bytes",
        "Content-Disposition": "inline",
      });
      const body = Buffer.from(m.body),
        range = req.get("Range");
      if (!range) return res.send(body);
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      let start = 0,
        end = body.length - 1;
      if (match && (match[1] || match[2])) {
        if (!match[1]) start = Math.max(0, body.length - Number(match[2]));
        else {
          start = Number(match[1]);
          if (match[2]) end = Math.min(end, Number(match[2]));
        }
      } else
        return res
          .status(416)
          .set("Content-Range", `bytes */${body.length}`)
          .end();
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start > end ||
        start >= body.length
      )
        return res
          .status(416)
          .set("Content-Range", `bytes */${body.length}`)
          .end();
      res
        .status(206)
        .set("Content-Range", `bytes ${start}-${end}/${body.length}`)
        .send(body.subarray(start, end + 1));
    }),
  );
  app.get(
    "/api/admin/reviews",
    permission("reviews"),
    asyncRoute((req, res) => {
      const rows = pageRows(
        db,
        "SELECT r.*,p.name product_name,u.name author FROM reviews r JOIN products p ON p.id=r.product_id JOIN users u ON u.id=r.user_id WHERE p.name LIKE ? OR r.comment LIKE ? ORDER BY r.created_at DESC",
        [
          "%" + String(req.query.q || "").slice(0, 100) + "%",
          "%" + String(req.query.q || "").slice(0, 100) + "%",
        ],
        req,
      );
      rows.items = rows.items.map((r) => ({ ...r, media: filesFor(db, r.id) }));
      res.json(rows);
    }),
  );
  app.put(
    "/api/admin/reviews/:id",
    permission("reviews"),
    asyncRoute((req, res) => {
      const v = z
        .object({
          visible: z.boolean(),
          reason: z.string().trim().min(2).max(300),
          version: z.number().int().positive(),
        })
        .parse(req.body);
      transaction(db, () => {
        if (
          !db
            .prepare(
              "UPDATE reviews SET visible=?,moderation_reason=?,version=version+1,updated_at=? WHERE id=? AND version=?",
            )
            .run(+v.visible, v.reason, now(), req.params.id, v.version).changes
        )
          fail(409, "รีวิวเปลี่ยนแล้วหรือไม่พบ กรุณาโหลดใหม่");
        audit(db, req.user.id, "review.moderated", req.params.id, {
          visible: v.visible,
        });
      });
      res.json({ ok: true });
    }),
  );
}
