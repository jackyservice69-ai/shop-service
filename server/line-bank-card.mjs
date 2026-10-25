import sharp from "sharp";
import { audit, getSettings, hash } from "./db.mjs";
import { secret } from "./integrations.mjs";
import { receivingPublicData } from "./merchant-account-policy.mjs";
import {
  bankDetailsData,
  bankDetailsSnapshot,
} from "../shared/bank-details.mjs";
import { fail } from "./commerce.mjs";

const cache = new WeakMap(),
  rendering = new WeakMap();
export function isBankAccountRequest(value) {
  const text = String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u200b-\u200d\ufeff\s.,!?ๆ]/g, "");
  return /(?:ขอ(?:ชื่อ|เลข(?:ที่)?|รูป)?(?:บัญชี|บช)|ขอ(?:รูป)?(?:qr|คิวอาร์|คิวอา)|เลข(?:ที่)?บัญชี(?:ร้าน|ธนาคาร)?|บัญชี(?:ร้าน|ธนาคาร)|โอน(?:เงิน)?(?:เข้า)?(?:บัญชี)?(?:ไหน|ที่ไหน)|bank(?:account|details)|paymentdetails)/u.test(
    text,
  );
}

export function currentBankCard(db, config) {
  const s = getSettings(db),
    credentialHash = hash(secret(db, "easyslipApiKey", config));
  const receiving = receivingPublicData(
    s,
    credentialHash,
    !!secret(db, "easyslipApiKey", config),
  );
  const ready = receiving.topupReady && !!receiving.bankNumber;
  if (!ready) fail(503, "ร้านยังไม่ได้ตั้งค่าบัญชีรับเงินให้พร้อมใช้งาน");
  const qr = receiving.paymentQr;
  const data = bankDetailsData({
    ...s,
    ...receiving,
    paymentQr: qr,
    paymentQrFrame: qr ? receiving.paymentQrFrame : null,
    topupReady: ready,
  });
  return {
    data,
    snapshot: bankDetailsSnapshot(data),
    fingerprint: hash(bankDetailsSnapshot(data) + ":" + credentialHash),
  };
}

export async function captureBankPanel(config, state) {
  const base = new URL(
    config.bankCardRenderOrigin || `http://127.0.0.1:${config.port || 3002}`,
  );
  if (
    base.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) ||
    base.username ||
    base.password ||
    base.pathname !== "/" ||
    base.search ||
    base.hash
  )
    throw new Error("BANK_CARD_LOCAL_ORIGIN_REQUIRED");
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true, timeout: 12000 });
  const deadline = setTimeout(
    () => void browser.close().catch(() => {}),
    22000,
  );
  deadline.unref();
  try {
    const context = await browser.newContext({
      viewport: { width: 600, height: 1200 },
      deviceScaleFactor: 2,
      serviceWorkers: "block",
      locale: "th-TH",
    });
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      // No customer session or external page/asset/AI requests enter this browser.
      return url.origin === base.origin ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    const response = await page.goto(base.origin + "/bank-details-card", {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    if (!response?.ok()) throw new Error("BANK_CARD_PAGE_UNAVAILABLE");
    const panel = page.locator(".panel.bank-details");
    await panel.waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".bank-details img")].every(
        (img) => img.complete && img.naturalWidth > 0,
      ),
    );
    if (state.data.paymentQr)
      await panel.locator(".payment-qr-image").waitFor();
    if ((await panel.getAttribute("data-bank-card-state")) !== state.snapshot)
      throw new Error("BANK_CARD_SETTINGS_CHANGED");
    const original = await panel.screenshot({
      type: "png",
      animations: "disabled",
      timeout: 8000,
    });
    const preview = await sharp(original)
      .resize({ width: 540, withoutEnlargement: true })
      .png()
      .toBuffer();
    return { original, preview };
  } finally {
    clearTimeout(deadline);
    await browser.close();
  }
}

export async function getBankCard(db, config, expected) {
  const state = currentBankCard(db, config);
  if (expected && expected !== state.fingerprint)
    fail(404, "ข้อมูลบัญชีรับเงินเปลี่ยนแล้ว");
  const existing = cache.get(db);
  if (existing?.fingerprint === state.fingerprint) return existing;
  let pending = rendering.get(db);
  if (pending && pending.fingerprint !== state.fingerprint)
    fail(503, "กำลังปรับปรุงรูปบัญชีรับเงิน กรุณาลองใหม่");
  if (!pending) {
    pending = { fingerprint: state.fingerprint, promise: null };
    pending.promise = (async () => {
      const images = await (config.bankCardRenderer || captureBankPanel)(
        config,
        state,
      );
      if (currentBankCard(db, config).fingerprint !== state.fingerprint)
        fail(409, "บัญชีรับเงินเปลี่ยนระหว่างสร้างรูป");
      const original = Buffer.from(images.original),
        preview = Buffer.from(images.preview);
      const info = await sharp(original).metadata(),
        thumb = await sharp(preview).metadata();
      if (
        info.format !== "png" ||
        thumb.format !== "png" ||
        original.length > 10 * 1024 * 1024 ||
        preview.length > 1024 * 1024 ||
        info.width > 2000 ||
        info.height > 2000 ||
        thumb.width > 2000 ||
        thumb.height > 2000
      )
        throw new Error("BANK_CARD_IMAGE_INVALID");
      const result = { ...state, original, preview };
      cache.set(db, result);
      return result;
    })();
    rendering.set(db, pending);
  }
  try {
    return await pending.promise;
  } finally {
    if (rendering.get(db) === pending) rendering.delete(db);
  }
}

export async function bankAccountMessages(db, config) {
  const origin = new URL(config.origin);
  const fallback = () => {
    try {
      const { data } = currentBankCard(db, config);
      return [
        {
          type: "text",
          text: `บัญชีรับเงินของร้าน\n${data.bankName}\n${data.bankNumber}\n${data.accountName}\nตรวจสอบผู้รับก่อนโอน และดู QR ปัจจุบันได้ที่ ${origin.origin}/wallet`,
        },
      ];
    } catch {
      return [
        {
          type: "text",
          text: "ร้านยังไม่ได้ตั้งค่าบัญชีรับเงินให้พร้อมใช้งาน กรุณาติดต่อเจ้าหน้าที่ค่ะ",
        },
      ];
    }
  };
  try {
    if (origin.protocol !== "https:" || origin.username || origin.password)
      return fallback();
    const card = await getBankCard(db, config),
      s = getSettings(db);
    const root = `${origin.origin}/api/line/bank-card/${card.fingerprint}`;
    const instructions =
      s.lineLoginEnabled && s.lineTopupEnabled
        ? "บัญชีรับเงินของร้านค่ะ ตรวจชื่อผู้รับก่อนโอนทุกครั้ง หากเติมกระเป๋าเงิน กรุณาเชื่อมต่อ LINE ในหน้าบัญชีของฉันก่อน แล้วส่งรูปสลิปในแชทนี้ค่ะ"
        : `บัญชีรับเงินของร้านค่ะ ตรวจชื่อผู้รับก่อนโอนทุกครั้ง แล้วแนบสลิปเติมเงินที่ ${origin.origin}/wallet`;
    return [
      { type: "text", text: instructions },
      {
        type: "image",
        originalContentUrl: root + "/original.png",
        previewImageUrl: root + "/preview.png",
      },
    ];
  } catch {
    audit(db, null, "bot.bank_card_failed", "bank_details");
    return fallback();
  }
}
