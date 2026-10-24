import { randomBytes } from "node:crypto";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import {
  audit,
  now,
  passwordHash,
  passwordMatches,
  transaction,
} from "./db.mjs";
import { fail } from "./commerce.mjs";

export const memberProfileSchema = z.object({
  firstName: z.string().trim().min(1, "กรุณากรอกชื่อหน้า").max(80),
  lastName: z.string().trim().min(1, "กรุณากรอกนามสกุล").max(80),
  phone: z
    .string()
    .trim()
    .min(1)
    .max(30)
    .transform((value) => value.replace(/[\s()-]/g, ""))
    .refine(
      (value) => /^(?:0\d{8,9}|\+[1-9]\d{7,14})$/.test(value),
      "ใช้เบอร์ไทย 9–10 หลัก หรือรหัสประเทศ เช่น +66812345678",
    ),
  discoverySource: z.string().trim().max(120).default(""),
  lineId: z
    .string()
    .trim()
    .max(100)
    .regex(
      /^[A-Za-z0-9_.@-]*$/,
      "LINE ID ใช้ตัวอักษรอังกฤษ ตัวเลข จุด ขีดล่าง ขีดกลาง หรือ @",
    )
    .default(""),
  email: z
    .email()
    .max(200)
    .transform((v) => v.toLowerCase()),
});
const approval = {
  version: z.number().int().positive(),
  actorPassword: z
    .string()
    .min(1, "กรุณากรอกรหัสผ่านของคุณเพื่อยืนยัน")
    .max(128),
};
export function attachMemberManagement(app, db, { permission, asyncRoute }) {
  const sensitiveLimiter = rateLimit({
    windowMs: 15 * 60000,
    limit: 10,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => req.user.id,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "ยืนยันรายการหลายครั้งเกินไป กรุณารอ 15 นาที" },
  });
  const authorize = (action) => [
    permission("members"),
    permission(action),
    sensitiveLimiter,
  ];
  const customer = (req, version) => {
    const u = db.prepare("SELECT * FROM users WHERE id=?").get(req.params.id);
    if (!u) fail(404, "ไม่พบลูกค้า");
    if (u.role_id !== "customer")
      fail(403, "แก้ไขหรือรีเซ็ตผ่านส่วนนี้ได้เฉพาะบัญชีลูกค้า");
    if (u.member_version !== version)
      fail(409, "ข้อมูลลูกค้าเปลี่ยนแล้ว กรุณาโหลดใหม่");
    return u;
  };
  const reauthenticate = (req, password) => {
    if (!passwordMatches(password, req.user.password)) {
      audit(db, req.user.id, "member.reauthentication_failed", req.params.id);
      fail(400, "รหัสผ่านผู้ดำเนินการไม่ถูกต้อง");
    }
  };
  app.put(
    "/api/admin/members/:id/profile",
    ...authorize("member_edit"),
    asyncRoute((req, res) => {
      const v = memberProfileSchema.extend(approval).strict().parse(req.body);
      reauthenticate(req, v.actorPassword);
      transaction(db, () => {
        const u = customer(req, v.version);
        if (v.email !== u.email && !u.has_password)
          fail(
            409,
            "บัญชีนี้ใช้ Google กรุณารีเซ็ตรหัสผ่านก่อนเปลี่ยนอีเมล เพื่อให้ลูกค้ายังเข้าสู่ระบบได้",
          );
        if (
          db
            .prepare("SELECT id FROM users WHERE email=? AND id!=?")
            .get(v.email, u.id)
        )
          fail(409, "อีเมลนี้ถูกใช้งานแล้ว");
        db.prepare(
          "UPDATE users SET name=?,first_name=?,last_name=?,phone=?,email=?,discovery_source=?,line_id=?,member_version=member_version+1 WHERE id=?",
        ).run(
          v.firstName + " " + v.lastName,
          v.firstName,
          v.lastName,
          v.phone,
          v.email,
          v.discoverySource,
          v.lineId,
          u.id,
        );
        if (v.email !== u.email)
          db.prepare("DELETE FROM google_identities WHERE user_id=?").run(u.id);
        db.prepare("DELETE FROM sessions WHERE user_id=?").run(u.id);
        audit(db, req.user.id, "member.profile_updated", u.id, {
          fields: [
            "first_name",
            "last_name",
            "phone",
            "email",
            "discovery_source",
            "line_id",
          ].filter(
            (k, i) =>
              u[k] !==
              [
                v.firstName,
                v.lastName,
                v.phone,
                v.email,
                v.discoverySource,
                v.lineId,
              ][i],
          ),
          sessionsRevoked: true,
          googleUnlinked: v.email !== u.email,
        });
      });
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/admin/members/:id/reset-password",
    ...authorize("member_reset"),
    asyncRoute((req, res) => {
      const v = z.object(approval).strict().parse(req.body);
      reauthenticate(req, v.actorPassword);
      const temporaryPassword = randomBytes(18).toString("base64url"),
        expiresAt = new Date(Date.now() + 24 * 3600000).toISOString();
      transaction(db, () => {
        const u = customer(req, v.version);
        if (!u.active)
          fail(409, "ลูกค้าถูกระงับ กรุณาเปิดใช้งานก่อนรีเซ็ตรหัสผ่าน");
        db.prepare(
          "UPDATE users SET password=?,has_password=1,must_change_password=1,password_reset_expires_at=?,member_version=member_version+1 WHERE id=?",
        ).run(passwordHash(temporaryPassword), expiresAt, u.id);
        db.prepare("DELETE FROM sessions WHERE user_id=?").run(u.id);
        audit(db, req.user.id, "member.password_reset", u.id, {
          expiresAt,
          sessionsRevoked: true,
        });
      });
      res
        .set("Cache-Control", "no-store")
        .json({ temporaryPassword, expiresAt });
    }),
  );
}
