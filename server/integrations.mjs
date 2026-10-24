import { createHmac, timingSafeEqual } from "node:crypto";
import { getSettings, decrypt, hash, now, audit, transaction } from "./db.mjs";
import { fail } from "./commerce.mjs";
import { lineSlipReply, queueLineImage } from "./line-topup.mjs";
import { authorizeSlipPromptpay } from "./payment-qr.mjs";
import {
  bankAccountMessages,
  isBankAccountRequest,
} from "./line-bank-card.mjs";
export const SECRET_KEYS = [
  "easyslipApiKey",
  "lineChannelSecret",
  "lineChannelAccessToken",
  "lineLoginChannelSecret",
  "openaiApiKey",
];
export function secret(db, key, config) {
  const s = getSettings(db);
  if (s[key]) return decrypt(s[key], config.encryptionKey);
  return config.secrets?.[key] || "";
}
export async function easySlip(db, config, file, amount) {
  const key = secret(db, "easyslipApiKey", config);
  if (!key) fail(503, "ยังไม่ได้ตั้งค่า EasySlip API key");
  const form = new FormData();
  form.append(
    "image",
    new Blob([file.buffer], { type: file.mimetype }),
    "slip",
  );
  form.append("matchAccount", "true");
  form.append("checkDuplicate", "true");
  if (amount !== null) form.append("matchAmount", String(amount / 100));
  const res = await (config.fetch || fetch)(
    "https://api.easyslip.com/v2/verify/bank",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(25000),
    },
  );
  const body = await res.json();
  if (!res.ok || !body.success)
    fail(
      res.status === 429 ? 429 : 422,
      `ตรวจสลิปไม่สำเร็จ (${body.error?.code || "PROVIDER_ERROR"}) กรุณาตรวจสอบสลิปหรือการตั้งค่า`,
    );
  if (hash(key) !== hash(secret(db, "easyslipApiKey", config)))
    fail(409, "API key เปลี่ยนระหว่างตรวจสอบ กรุณาลองใหม่");
  if (body.data?.isDuplicate === false)
    await authorizeSlipPromptpay(db, config, body.data);
  return body.data;
}
export async function easyRequest(db, config, path) {
  const key = secret(db, "easyslipApiKey", config);
  if (!key) fail(503, "ยังไม่ได้ตั้งค่า EasySlip API key");
  const res = await (config.fetch || fetch)(
    `https://api.easyslip.com/v2/${path}`,
    {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15000),
    },
  );
  const body = await res.json();
  if (!res.ok || !body.success)
    fail(502, `EasySlip ไม่พร้อมใช้งาน (${body.error?.code || res.status})`);
  return body.data;
}
export function lineSignature(raw, signature, key) {
  if (!signature || !key) return false;
  const expected = createHmac("sha256", key).update(raw).digest();
  const actual = Buffer.from(signature, "base64");
  return actual.length === expected.length && timingSafeEqual(expected, actual);
}
export function queueWebhook(db, body) {
  return transaction(db, () => {
    for (const event of body.events || []) {
      if (event.type === "message" && event.message?.type === "image") {
        queueLineImage(db, event);
        continue;
      }
      if (
        event.type !== "message" ||
        event.message?.type !== "text" ||
        !event.replyToken ||
        !event.webhookEventId
      )
        continue;
      db.prepare(
        "INSERT OR IGNORE INTO webhook_events(id,payload,created_at,updated_at) VALUES(?,?,?,?)",
      ).run(
        event.webhookEventId,
        JSON.stringify({
          replyToken: event.replyToken,
          text: String(event.message.text).slice(0, 2000),
        }),
        now(),
        now(),
      );
    }
  });
}
export async function answerBot(db, config, text) {
  const s = getSettings(db),
    key = secret(db, "openaiApiKey", config);
  if (!s.aiEnabled || !key) return s.botGreeting;
  const products = db
    .prepare(
      "SELECT name,price,stock FROM products WHERE active=1 ORDER BY created_at DESC LIMIT 20",
    )
    .all();
  const response = await (config.fetch || fetch)(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: s.aiModel,
        store: false,
        instructions: `${s.aiInstructions}\nข้อมูลสินค้าสาธารณะ (ราคาเป็นสตางค์): ${JSON.stringify(products)}\nไม่สามารถเข้าถึงบัญชีหรือทำธุรกรรมได้ ไม่รับข้อมูลส่วนตัวหรือรหัสผ่าน`,
        input: text,
        max_output_tokens: 400,
      }),
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!response.ok) throw new Error("OPENAI_UNAVAILABLE");
  const body = await response.json();
  const result = body.output
    ?.flatMap((o) => o.content || [])
    .filter((c) => c.type === "output_text")
    .map((c) => c.text)
    .join("\n");
  if (!result) throw new Error("EMPTY_AI_RESPONSE");
  return result.slice(0, 4500);
}
export function startBotWorker(db, config) {
  let busy = false;
  const tick = async () => {
    if (busy || !getSettings(db).botEnabled) return;
    busy = true;
    try {
      const event = db
        .prepare(
          "SELECT * FROM webhook_events WHERE status IN ('pending','retry') AND attempts<3 AND updated_at<=? ORDER BY created_at LIMIT 1",
        )
        .get(new Date(Date.now() - 3000).toISOString());
      if (!event) return;
      const claimed = db
        .prepare(
          "UPDATE webhook_events SET status='processing',attempts=attempts+1,updated_at=? WHERE id=? AND status IN ('pending','retry') AND attempts=?",
        )
        .run(now(), event.id, event.attempts);
      if (!claimed.changes) return;
      try {
        const payload = JSON.parse(event.payload);
        const bankRequest =
          payload.kind !== "image" && isBankAccountRequest(payload.text);
        let messages = bankRequest
          ? await bankAccountMessages(db, config)
          : null;
        let reply = event.reply_text;
        if (!reply && !messages) {
          if (payload.kind === "image") {
            try {
              reply = await lineSlipReply(db, config, event, payload);
            } catch (e) {
              if (
                (!e.status || e.status >= 500 || e.status === 429) &&
                event.attempts < 2
              )
                throw e;
              reply =
                "ยังเติมเงินจากรูปนี้ไม่ได้ กรุณาตรวจสอบสลิปและบัญชีผู้รับ หรือติดต่อร้านพร้อมเลขอ้างอิง " +
                event.id;
              audit(
                db,
                payload.linkedUserId || null,
                "wallet.line_topup_rejected",
                event.id,
                { reason: "validation_or_provider" },
              );
            }
          } else {
            try {
              reply = await answerBot(db, config, payload.text);
            } catch {
              reply =
                "ขณะนี้ผู้ช่วยตอบอัตโนมัติไม่พร้อมใช้งาน กรุณาติดต่อเจ้าหน้าที่ผ่านช่องทางของร้านค่ะ";
              audit(db, null, "bot.ai_failed", event.id);
            }
          }
          if (payload.kind === "image")
            db.prepare("UPDATE webhook_events SET reply_text=? WHERE id=?").run(
              reply,
              event.id,
            );
        }
        const token = secret(db, "lineChannelAccessToken", config);
        if (!token) throw new Error("LINE_NOT_CONFIGURED");
        const res = await (config.fetch || fetch)(
          "https://api.line.me/v2/bot/message/reply",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              replyToken: payload.replyToken,
              messages: messages || [{ type: "text", text: reply }],
            }),
            signal: AbortSignal.timeout(15000),
          },
        );
        if (!res.ok) throw new Error(`LINE_HTTP_${res.status}`);
        db.prepare(
          "UPDATE webhook_events SET status='done',payload='{}',error='',updated_at=? WHERE id=?",
        ).run(now(), event.id);
        audit(db, null, "bot.replied", event.id);
      } catch (e) {
        const state = event.attempts >= 2 ? "failed" : "retry";
        db.prepare(
          "UPDATE webhook_events SET status=?,error=?,updated_at=? WHERE id=?",
        ).run(state, String(e.message).slice(0, 100), now(), event.id);
        if (state === "failed")
          db.prepare("UPDATE webhook_events SET payload='{}' WHERE id=?").run(
            event.id,
          );
        audit(db, null, "bot.reply_failed", event.id, { status: state });
      }
    } finally {
      busy = false;
    }
  };
  transaction(db, () => {
    const exhausted = db
      .prepare(
        "SELECT id FROM webhook_events WHERE status IN ('processing','pending','retry') AND attempts>=3",
      )
      .all();
    for (const event of exhausted) {
      db.prepare(
        "UPDATE webhook_events SET status='failed',payload='{}',error='INTERRUPTED_FINAL_ATTEMPT',updated_at=? WHERE id=?",
      ).run(now(), event.id);
      audit(db, null, "bot.recovery_failed", event.id);
    }
    db.prepare(
      "UPDATE webhook_events SET status='retry' WHERE status='processing' AND attempts<3",
    ).run();
  });
  const timer = setInterval(
    () =>
      tick().catch(() => {
        busy = false;
      }),
    2000,
  );
  timer.unref();
  return { tick, stop: () => clearInterval(timer) };
}
