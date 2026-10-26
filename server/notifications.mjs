import { z } from "zod";
import { now, transaction, audit } from "./db.mjs";
import { hasPermission } from "../shared/authorization.mjs";
import { fail } from "./commerce.mjs";

function notice(
  db,
  {
    topic,
    entityId,
    version,
    kind,
    recipientId = null,
    requiredPermission = "consignments",
    title,
    body,
    href,
  },
) {
  db.prepare(
    `INSERT OR IGNORE INTO notifications(event_key,recipient_id,required_permission,topic,entity_id,kind,title,body,href,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    `${topic}:${entityId}:${version}:${kind}:${recipientId || "approvers"}`,
    recipientId,
    recipientId ? "" : requiredPermission,
    topic,
    entityId,
    kind,
    title,
    body,
    href,
    now(),
  );
}

export function resolveApprovalNotices(db, topic, entityId, exceptKey = "") {
  db.prepare(
    "UPDATE notifications SET resolved_at=? WHERE topic=? AND entity_id=? AND event_key<>? AND recipient_id IS NULL AND resolved_at IS NULL",
  ).run(now(), topic, entityId, exceptKey);
}

export function notifyMembershipRequest(db, userId, shopName, version = 1) {
  const common = { topic: "consignment.membership", entityId: userId, version };
  notice(db, {
    ...common,
    kind: "request",
    title: "มีคำขอสมัครตัวแทนฝากขาย",
    body: `ร้าน “${shopName}” ส่งคำขอสมัคร รอการพิจารณา`,
    href: "/admin/consignments",
  });
  notice(db, {
    ...common,
    recipientId: userId,
    kind: "submitted",
    title: "ส่งคำขอสมัครตัวแทนแล้ว",
    body: `ร้าน “${shopName}” อยู่ระหว่างรออนุมัติ`,
    href: "/consignment",
  });
}

export function notifyProductRequest(db, product, confirm = true) {
  const common = {
    topic: "consignment.product",
    entityId: product.id,
    version: product.version,
  };
  resolveApprovalNotices(
    db,
    common.topic,
    common.entityId,
    `${common.topic}:${common.entityId}:${common.version}:request:approvers`,
  );
  notice(db, {
    ...common,
    kind: "request",
    title: "มีสินค้าฝากขายรออนุมัติ",
    body: `สินค้า “${product.name}” ถูกส่งให้ร้านตรวจสอบ`,
    href: "/admin/consignments?tab=products",
  });
  if (confirm)
    notice(db, {
      ...common,
      recipientId: product.consignor_id,
      kind: "submitted",
      title: "ส่งสินค้าตรวจอนุมัติแล้ว",
      body: `สินค้า “${product.name}” อยู่ระหว่างรออนุมัติ`,
      href: "/consignment?tab=products",
    });
}

export function notifyMembershipDecision(db, member, status, version) {
  resolveApprovalNotices(db, "consignment.membership", member.user_id);
  const labels = {
    approved: "อนุมัติเป็นตัวแทนฝากขายแล้ว",
    rejected: "คำขอสมัครตัวแทนไม่ผ่านอนุมัติ",
    suspended: "สมาชิกตัวแทนถูกระงับ",
  };
  notice(db, {
    topic: "consignment.membership",
    entityId: member.user_id,
    version,
    recipientId: member.user_id,
    kind: status,
    title: labels[status],
    body: `สถานะร้าน “${member.shop_name}” มีการเปลี่ยนแปลง ดูรายละเอียดในหน้าฝากขาย`,
    href: "/consignment",
  });
  if (status !== "approved") {
    db.prepare(
      "UPDATE notifications SET resolved_at=? WHERE recipient_id IS NULL AND topic='consignment.product' AND resolved_at IS NULL AND entity_id IN (SELECT id FROM products WHERE consignor_id=?)",
    ).run(now(), member.user_id);
  } else {
    for (const product of db
      .prepare(
        "SELECT id,name,version,consignor_id FROM products WHERE consignor_id=? AND consignment_status='pending'",
      )
      .all(member.user_id))
      notifyProductRequest(db, product, false);
  }
}

export function notifyProductDecision(db, product, approved, version) {
  resolveApprovalNotices(db, "consignment.product", product.id);
  notice(db, {
    topic: "consignment.product",
    entityId: product.id,
    version,
    recipientId: product.consignor_id,
    kind: approved ? "approved" : "rejected",
    title: approved
      ? "สินค้าฝากขายได้รับอนุมัติแล้ว"
      : "สินค้าฝากขายไม่ผ่านอนุมัติ",
    body: `สินค้า “${product.name}” ${approved ? "ผ่านการตรวจและเปิดขายแล้ว" : "ยังไม่เปิดขาย ดูรายละเอียดในหน้าฝากขาย"}`,
    href: "/consignment?tab=products",
  });
}

export function notifyWithdrawal(db, withdrawal, action) {
  const common = {
    topic: "consignment.withdrawal",
    entityId: withdrawal.id,
    version: withdrawal.version,
  };
  resolveApprovalNotices(db, common.topic, common.entityId);
  const amount = new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
  }).format(withdrawal.amount / 100);
  const labels = {
    submitted: "ส่งคำขอถอนเงินแล้ว",
    approved: "คำขอถอนเงินได้รับอนุมัติแล้ว",
    processing: "ร้านกำลังดำเนินการโอนเงิน",
    rejected: "คำขอถอนเงินไม่ผ่านอนุมัติ",
    cancelled: "ยกเลิกคำขอถอนเงินแล้ว",
    paid: "ร้านบันทึกโอนเงินให้แล้ว",
  };
  notice(db, {
    ...common,
    recipientId: withdrawal.user_id,
    kind: action,
    title: labels[action],
    body: `ยอด ${amount} · ดูรายละเอียดและสถานะในหน้าตัวแทนฝากขาย`,
    href: "/consignment?tab=withdrawals",
  });
  if (["submitted", "approved"].includes(action))
    notice(db, {
      ...common,
      kind: "request",
      requiredPermission:
        action === "submitted" ? "withdrawals_approve" : "withdrawals_pay",
      title:
        action === "submitted"
          ? "มีคำขอถอนเงินรออนุมัติ"
          : "มีคำขอถอนที่อนุมัติแล้ว รอโอนเงิน",
      body: `ยอด ${amount} · ตรวจสอบคำขอในระบบหลังบ้าน`,
      href: "/admin/withdrawals",
    });
}

const positiveId = z.coerce
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);
function visible(user) {
  return {
    sql: "(n.recipient_id=? OR (n.recipient_id IS NULL AND n.resolved_at IS NULL AND ((n.required_permission='consignments' AND ?=1) OR (n.required_permission='withdrawals_approve' AND ?=1) OR (n.required_permission='withdrawals_pay' AND ?=1))))",
    params: [
      user.id,
      +hasPermission(user, "consignments"),
      +hasPermission(user, "withdrawals_approve"),
      +hasPermission(user, "withdrawals_pay"),
    ],
  };
}
function summary(db, user) {
  const scope = visible(user);
  return db
    .prepare(
      `SELECT COALESCE(MAX(n.id),0) snapshot, COALESCE(SUM(CASE WHEN r.notification_id IS NULL THEN 1 ELSE 0 END),0) unreadCount
    FROM notifications n LEFT JOIN notification_reads r ON r.notification_id=n.id AND r.user_id=? WHERE ${scope.sql}`,
    )
    .get(user.id, ...scope.params);
}

export function attachNotifications(app, db, { auth, csrf, asyncRoute }) {
  app.get(
    "/api/notifications",
    auth,
    asyncRoute((req, res) => {
      const query = z
        .object({
          before: positiveId.optional(),
          size: z.coerce.number().int().min(1).max(50).default(20),
        })
        .strict()
        .parse(req.query);
      const scope = visible(req.user);
      const rows = db
        .prepare(
          `SELECT n.id,n.kind,n.title,n.body,n.href,n.created_at,r.read_at FROM notifications n
      LEFT JOIN notification_reads r ON r.notification_id=n.id AND r.user_id=?
      WHERE ${scope.sql}${query.before ? " AND n.id<?" : ""} ORDER BY n.id DESC LIMIT ?`,
        )
        .all(
          req.user.id,
          ...scope.params,
          ...(query.before ? [query.before] : []),
          query.size + 1,
        );
      const items = rows.slice(0, query.size);
      res.json({
        items,
        nextCursor: rows.length > query.size ? items.at(-1).id : null,
        ...summary(db, req.user),
      });
    }),
  );
  app.post(
    "/api/notifications/read-all",
    auth,
    csrf,
    asyncRoute((req, res) => {
      const { through } = z
        .object({
          through: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
        })
        .strict()
        .parse(req.body);
      const scope = visible(req.user);
      transaction(db, () => {
        if (
          !db
            .prepare(
              `SELECT n.id FROM notifications n WHERE n.id=? AND ${scope.sql}`,
            )
            .get(through, ...scope.params)
        )
          fail(404, "ไม่พบการแจ้งเตือน");
        const result = db
          .prepare(
            `INSERT OR IGNORE INTO notification_reads(notification_id,user_id,read_at)
        SELECT n.id,?,? FROM notifications n WHERE n.id<=? AND ${scope.sql}`,
          )
          .run(req.user.id, now(), through, ...scope.params);
        if (result.changes)
          audit(db, req.user.id, "notifications.read_all", "notifications", {
            through,
            count: result.changes,
          });
      });
      res.json({ ok: true, ...summary(db, req.user) });
    }),
  );
  app.post(
    "/api/notifications/:id/read",
    auth,
    csrf,
    asyncRoute((req, res) => {
      z.object({}).strict().parse(req.body);
      const notificationId = positiveId.parse(req.params.id),
        scope = visible(req.user);
      transaction(db, () => {
        if (
          !db
            .prepare(
              `SELECT n.id FROM notifications n WHERE n.id=? AND ${scope.sql}`,
            )
            .get(notificationId, ...scope.params)
        )
          fail(404, "ไม่พบการแจ้งเตือน");
        const result = db
          .prepare(
            "INSERT OR IGNORE INTO notification_reads(notification_id,user_id,read_at) VALUES(?,?,?)",
          )
          .run(notificationId, req.user.id, now());
        if (result.changes)
          audit(db, req.user.id, "notifications.read", String(notificationId));
      });
      res.json({ ok: true, ...summary(db, req.user) });
    }),
  );
}
