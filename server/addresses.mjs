import { z } from "zod";
import { id, now, transaction, audit } from "./db.mjs";
import { fail } from "./commerce.mjs";

export const coordinatesSchema = z
  .object({
    latitude: z.number().finite().min(-90).max(90).nullable().default(null),
    longitude: z.number().finite().min(-180).max(180).nullable().default(null),
  })
  .refine(
    (v) => (v.latitude === null) === (v.longitude === null),
    "กรุณาระบุพิกัดทั้งสองช่องหรือเว้นว่างทั้งคู่",
  );
const schema = z
  .object({
    label: z.string().trim().min(1).max(60),
    name: z.string().trim().min(2).max(100),
    phone: z
      .string()
      .trim()
      .regex(/^0\d{8,9}$/, "ใช้เบอร์โทรไทย 9–10 หลัก"),
    address: z.string().trim().min(10).max(1000),
    latitude: coordinatesSchema.shape.latitude,
    longitude: coordinatesSchema.shape.longitude,
    isDefault: z.boolean().default(false),
    version: z.number().int().positive().optional(),
  })
  .refine(
    (v) => (v.latitude === null) === (v.longitude === null),
    "กรุณาระบุพิกัดทั้งสองช่องหรือเว้นว่างทั้งคู่",
  );
const own = (db, uid, aid) => {
  const row = db
    .prepare("SELECT * FROM addresses WHERE id=? AND user_id=?")
    .get(aid, uid);
  if (!row) fail(404, "ไม่พบที่อยู่");
  return row;
};
export function attachAddresses(app, db, { auth, csrf, asyncRoute }) {
  app.get(
    "/api/addresses",
    auth,
    asyncRoute((req, res) =>
      res.json({
        items: db
          .prepare(
            "SELECT id,label,name,phone,address,latitude,longitude,is_default,version FROM addresses WHERE user_id=? ORDER BY is_default DESC,created_at,id",
          )
          .all(req.user.id),
      }),
    ),
  );
  for (const method of ["post", "put"])
    app[method](
      "/api/addresses" + (method === "put" ? "/:id" : ""),
      auth,
      csrf,
      asyncRoute((req, res) => {
        const v = schema.parse(req.body),
          uid = req.user.id;
        const result = transaction(db, () => {
          const previous =
            method === "put" ? own(db, uid, req.params.id) : null;
          if (previous && v.version !== previous.version)
            fail(409, "ที่อยู่นี้เปลี่ยนแล้ว กรุณาโหลดข้อมูลใหม่");
          const count = db
            .prepare("SELECT COUNT(*) n FROM addresses WHERE user_id=?")
            .get(uid).n;
          if (!previous && count >= 20)
            fail(409, "บันทึกที่อยู่ได้สูงสุด 20 รายการ");
          const aid = previous?.id || id(),
            primary = !count || v.isDefault || !!previous?.is_default;
          if (primary)
            db.prepare(
              "UPDATE addresses SET is_default=0,version=version+1 WHERE user_id=? AND is_default=1",
            ).run(uid);
          if (previous)
            db.prepare(
              "UPDATE addresses SET label=?,name=?,phone=?,address=?,latitude=?,longitude=?,is_default=?,version=? WHERE id=? AND user_id=?",
            ).run(
              v.label,
              v.name,
              v.phone,
              v.address,
              v.latitude,
              v.longitude,
              +primary,
              previous.version + 1,
              aid,
              uid,
            );
          else
            db.prepare(
              "INSERT INTO addresses(id,user_id,label,name,phone,address,latitude,longitude,is_default,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
            ).run(
              aid,
              uid,
              v.label,
              v.name,
              v.phone,
              v.address,
              v.latitude,
              v.longitude,
              +primary,
              now(),
            );
          audit(
            db,
            uid,
            previous ? "address.updated" : "address.created",
            aid,
            { isDefault: primary },
          );
          return { id: aid };
        });
        res.status(method === "post" ? 201 : 200).json(result);
      }),
    );
  app.delete(
    "/api/addresses/:id",
    auth,
    csrf,
    asyncRoute((req, res) => {
      transaction(db, () => {
        const row = own(db, req.user.id, req.params.id);
        if (req.body.version !== row.version)
          fail(409, "ที่อยู่นี้เปลี่ยนแล้ว กรุณาโหลดข้อมูลใหม่");
        db.prepare("DELETE FROM addresses WHERE id=? AND user_id=?").run(
          row.id,
          req.user.id,
        );
        if (row.is_default)
          db.prepare(
            "UPDATE addresses SET is_default=1,version=version+1 WHERE id=(SELECT id FROM addresses WHERE user_id=? ORDER BY created_at,id LIMIT 1)",
          ).run(req.user.id);
        audit(db, req.user.id, "address.deleted", row.id);
      });
      res.json({ ok: true });
    }),
  );
}
