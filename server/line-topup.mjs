import { getSettings, hash, now } from "./db.mjs";
import { creditTopup, fail } from "./commerce.mjs";
import { easySlip, secret } from "./integrations.mjs";
import { merchantAccounts } from "./merchant-account-policy.mjs";

export function queueLineImage(db, event) {
  if (
    typeof event.webhookEventId !== "string" ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(event.webhookEventId) ||
    typeof event.replyToken !== "string" ||
    !event.replyToken ||
    event.replyToken.length > 256
  )
    return;
  if (
    db
      .prepare("SELECT id FROM webhook_events WHERE id=?")
      .get(event.webhookEventId)
  )
    return;
  const direct =
    event.source?.type === "user" &&
    /^U[a-f0-9]{32}$/.test(event.source.userId || "");
  const subject = direct ? event.source.userId : "";
  const s = getSettings(db);
  const linked = direct
    ? db
        .prepare(
          "SELECT l.*,u.active,u.role_id,u.must_change_password FROM line_identities l JOIN users u ON u.id=l.user_id WHERE l.subject=? AND l.channel_id=?",
        )
        .get(subject, s.lineLoginChannelId)
    : null;
  const eligible =
    linked?.active &&
    linked.role_id === "customer" &&
    !linked.must_change_password;
  let rateLimited = false;
  if (eligible) {
    const key = hash(subject),
      time = Date.now();
    db.prepare("DELETE FROM line_slip_limits WHERE window_start<?").run(
      time - 60000,
    );
    db.prepare(
      "INSERT INTO line_slip_limits VALUES(?,?,1) ON CONFLICT(subject_hash) DO UPDATE SET requests=requests+1",
    ).run(key, time);
    rateLimited =
      db
        .prepare("SELECT requests FROM line_slip_limits WHERE subject_hash=?")
        .get(key).requests > 6;
  }
  db.prepare(
    "INSERT INTO webhook_events(id,payload,created_at,updated_at) VALUES(?,?,?,?)",
  ).run(
    event.webhookEventId,
    JSON.stringify({
      kind: "image",
      enabledAtReceipt: !!s.lineTopupEnabled && !!s.lineLoginEnabled,
      replyToken: event.replyToken,
      direct,
      linkedUserId: eligible ? linked.user_id : null,
      bindingId: eligible ? linked.binding_id : null,
      messageId:
        /^\d{1,100}$/.test(event.message?.id || "") &&
        event.message?.contentProvider?.type !== "external"
          ? event.message.id
          : "",
      rateLimited,
    }),
    now(),
    now(),
  );
}

async function imageContent(config, token, messageId) {
  const response = await (config.fetch || fetch)(
    `https://api-data.line.me/v2/bot/message/${messageId}/content`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    },
  );
  if (!response.ok) throw new Error("LINE_CONTENT_UNAVAILABLE");
  const limit = 4 * 1024 * 1024;
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel();
    fail(413, "รูปสลิปต้องไม่เกิน 4 MB");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("LINE_CONTENT_EMPTY");
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        fail(413, "รูปสลิปต้องไม่เกิน 4 MB");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  const buffer = Buffer.concat(chunks),
    declared = response.headers.get("content-type")?.split(";")[0];
  const mimetype =
    buffer[0] === 255 && buffer[1] === 216
      ? "image/jpeg"
      : buffer
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ? "image/png"
        : buffer.toString("ascii", 0, 4) === "RIFF" &&
            buffer.toString("ascii", 8, 12) === "WEBP"
          ? "image/webp"
          : null;
  if (!mimetype || declared !== mimetype)
    fail(422, "ต้องส่งรูปสลิป JPEG, PNG หรือ WebP");
  return { buffer, mimetype };
}

export async function lineSlipReply(db, config, event, payload) {
  const s = getSettings(db);
  if (!payload.direct) return "กรุณาส่งสลิปในแชทส่วนตัวกับ LINE ร้านเท่านั้น";
  if (!payload.enabledAtReceipt)
    return "ร้านยังไม่เปิดบริการเติมเงินผ่าน LINE กรุณาเติมเงินผ่านเว็บไซต์";
  if (!payload.linkedUserId || !payload.bindingId)
    return `กรุณาเข้าสู่ระบบเว็บไซต์ ${config.origin}/account แล้วกด เชื่อมต่อ LINE ก่อนส่งสลิปเติมเงินค่ะ`;
  if (!s.lineTopupEnabled || !s.lineLoginEnabled)
    return "ร้านยังไม่เปิดบริการเติมเงินผ่าน LINE กรุณาเติมเงินผ่านเว็บไซต์";
  if (payload.rateLimited)
    return "ส่งสลิปหลายครั้งเกินไป กรุณารอ 1 นาทีแล้วลองใหม่ค่ะ";
  if (!payload.messageId) fail(422, "ไม่รองรับรูปภาพนี้");
  const linked = db
    .prepare(
      "SELECT l.*,u.active,u.role_id,u.must_change_password FROM line_identities l JOIN users u ON u.id=l.user_id WHERE l.user_id=? AND l.binding_id=? AND l.channel_id=?",
    )
    .get(payload.linkedUserId, payload.bindingId, s.lineLoginChannelId);
  if (
    !linked?.active ||
    linked.role_id !== "customer" ||
    linked.must_change_password
  )
    return "กรุณาเชื่อมต่อ LINE ในบัญชีของฉันใหม่ก่อนส่งสลิปค่ะ";
  const existing = db
    .prepare(
      "SELECT w.reply_text FROM line_topups t JOIN webhook_events w ON w.id=t.event_id WHERE t.event_id=?",
    )
    .get(event.id);
  if (existing) return existing.reply_text;
  const token = secret(db, "lineChannelAccessToken", config);
  if (!token) throw new Error("LINE_NOT_CONFIGURED");
  if (!merchantAccounts(s).length)
    fail(503, "ร้านยังไม่ได้ตั้งค่าบัญชีรับเงิน");
  const file = await imageContent(config, token, payload.messageId);
  if (
    db
      .prepare("SELECT id FROM topups WHERE image_hash=?")
      .get(hash(file.buffer))
  )
    fail(409, "สลิปนี้เติมเงินแล้ว");
  const credentials = hash(secret(db, "easyslipApiKey", config));
  const verified = await easySlip(db, config, file, null);
  if (credentials !== hash(secret(db, "easyslipApiKey", config)))
    fail(409, "การตั้งค่าเปลี่ยนแล้ว กรุณาลองอีกครั้ง");
  const amount = Math.round(Number(verified?.amountInSlip) * 100);
  creditTopup(
    db,
    payload.linkedUserId,
    "line_" + hash(event.id),
    hash(file.buffer),
    amount,
    verified,
    s,
    { eventId: event.id, bindingId: payload.bindingId },
  );
  return db
    .prepare("SELECT reply_text FROM webhook_events WHERE id=?")
    .get(event.id).reply_text;
}
