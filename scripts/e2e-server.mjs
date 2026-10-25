// Isolated in-memory environment. Never loads .env or contacts external providers.
import { fixture, slip, PASSWORD } from "../tests/helpers.mjs";
import sharp from "sharp";
import { bank } from "../tests/helpers.mjs";
import {
  branchAccounts,
  accountResponse,
  promptpayNumber,
} from "../tests/payment-data.mjs";
import {
  googleTestOptions,
  googleTestProvider,
} from "../tests/google-provider.mjs";
import { hash, setSetting } from "../server/db.mjs";
import { lineTestProvider, LINE_CHANNEL } from "../tests/line-provider.mjs";
import { startBotWorker } from "../server/integrations.mjs";
import { currentBankCard } from "../server/line-bank-card.mjs";
const google = googleTestProvider(() => f.db);
const line = lineTestProvider(() => f.db);
let nextPromptpaySlip = false;
const lineImage = await sharp({
  create: { width: 2, height: 2, channels: 3, background: "#f6c2c2" },
})
  .png()
  .toBuffer();
const f = fixture({
  // In-memory functional tests generate more traffic than one real browser session.
  apiRateLimit: 3000,
  authRateLimit: 500,
  origin: "http://127.0.0.1:4319",
  google: {
    ...googleTestOptions,
    redirectUri: "http://127.0.0.1:4319/api/auth/google/callback",
  },
  googleTransport: google,
  fetch: async (url, options) => {
    if (url.endsWith("/banks"))
      return Response.json({
        success: true,
        data: [
          { code: "014", nameTh: bank.bankName },
          { code: "004", nameTh: "ธนาคารกสิกรไทย" },
        ],
      });
    if (url.includes("/bank-accounts?"))
      return accountResponse([
        ...branchAccounts(bank),
        {
          id: 201,
          bankCode: "004",
          bankNumber: "9876543210",
          nameTh: "ร้านทดสอบสอง",
          nameEn: "SECOND TEST SHOP",
        },
        {
          id: 202,
          bankCode: "PROMPTPAY",
          bankNumber: "9876543210123",
          nameTh: "ร้านทดสอบสอง",
          nameEn: "SECOND TEST SHOP",
        },
      ]);
    if (url.includes("/verify/bank")) {
      const verified = slip(
        options.body.has("matchAmount")
          ? Number(options.body.get("matchAmount"))
          : 250,
      );
      if (nextPromptpaySlip) {
        nextPromptpaySlip = false;
        verified.matchedAccount = {
          ...verified.matchedAccount,
          bank: { code: "PROMPTPAY" },
          bankNumber: promptpayNumber,
        };
      }
      return Response.json({ success: true, data: verified });
    }
    if (url.includes("api-data.line.me/"))
      return new Response(lineImage, {
        headers: { "content-type": "image/png" },
      });
    if (url.includes("api.line.me/v2/bot/message/reply"))
      return Response.json({});
    if (url.includes("api.line.me/oauth2/")) return line.fetch(url, options);
    throw new Error("External network disabled in browser tests");
  },
});
f.config.secrets.lineLoginChannelSecret = "isolated-line-login-secret";
setSetting(f.db, "lineLoginChannelId", LINE_CHANNEL);
setSetting(f.db, "lineLoginEnabled", true);
const bot = startBotWorker(f.db, f.config);
bot.stop();
f.app.post("/__test/bank-card", (req, res) => {
  res.json({ fingerprint: currentBankCard(f.db, f.config).fingerprint });
});
// Merchant UI tests restore only their in-memory settings; this route never
// exists in the real application and cannot reach production data.
f.app.post("/__test/merchant-state", (req, res) => {
  const row = f.db
    .prepare("SELECT value FROM settings WHERE key='merchantAccounts'")
    .get();
  res.json({ value: row ? JSON.parse(row.value) : null });
});
f.app.put("/__test/merchant-state", (req, res) => {
  if (req.body.value === null)
    f.db.prepare("DELETE FROM settings WHERE key='merchantAccounts'").run();
  else setSetting(f.db, "merchantAccounts", req.body.value);
  res.json({ ok: true });
});
f.app.post("/__test/line-code", (req, res) => {
  const attempt = f.db
    .prepare("SELECT state_hash FROM line_auth_attempts WHERE state_hash=?")
    .get(hash(req.body.state || ""));
  if (!attempt) return res.sendStatus(404);
  res.json({ code: line.code(req.body.state, req.body.claims) });
});
f.app.post("/__test/promptpay-slip", (req, res) => {
  nextPromptpaySlip = true;
  res.json({ ok: true });
});
f.app.post("/__test/bot-tick", async (req, res) => {
  setSetting(f.db, "botEnabled", true);
  setSetting(f.db, "lineTopupEnabled", true);
  f.db
    .prepare(
      "UPDATE webhook_events SET updated_at='2000-01-01' WHERE status IN ('pending','retry')",
    )
    .run();
  await bot.tick();
  res.json({ ok: true });
});
// In-memory E2E only: the browser calls this after intercepting the Google
// authorization navigation. No testing endpoints exist in the real application.
f.app.post("/__test/google-code", (req, res) => {
  const attempt = f.db
    .prepare("SELECT * FROM google_auth_attempts WHERE state_hash=?")
    .get(hash(req.body.state || ""));
  if (!attempt) return res.sendStatus(404);
  res.json({
    code: google.code(req.body.state, {
      nonce: attempt.nonce,
      ...req.body.claims,
    }),
  });
});
f.db
  .prepare("UPDATE users SET email='admin@e2e.test' WHERE id=?")
  .run(f.admin.id);
const server = f.app.listen(4319, "127.0.0.1", () => {
  f.config.bankCardRenderOrigin = "http://127.0.0.1:4319";
  console.log("E2E isolated server ready");
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(() => {
      f.db.close();
      process.exit(0);
    }),
  );
