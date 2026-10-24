import sharp from "sharp";
import jsQR from "jsqr";
import { easyRequest, secret } from "./integrations.mjs";
import { fail } from "./commerce.mjs";
import { getSettings, hash, now } from "./db.mjs";
import {
  authorizePromptpayResponse,
  currentPaymentQr,
} from "./receiving-policy.mjs";

export function crc16(text) {
  let crc = 0xffff;
  for (const byte of Buffer.from(text)) {
    crc ^= byte << 8;
    for (let b = 0; b < 8; b++)
      crc = ((crc << 1) ^ (crc & 0x8000 ? 0x1021 : 0)) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
function tlv(text) {
  const out = {};
  for (let i = 0; i < text.length;) {
    const head = text.slice(i, i + 4),
      tag = head.slice(0, 2),
      length = Number(head.slice(2));
    if (
      !/^\d{4}$/.test(head) ||
      length < 1 ||
      i + 4 + length > text.length ||
      tag in out
    )
      fail(422, "โครงสร้าง QR รับเงินไม่ถูกต้อง");
    out[tag] = text.slice(i + 4, i + 4 + length);
    i += 4 + length;
  }
  return out;
}
export function parsePaymentPayload(payload) {
  if (
    typeof payload !== "string" ||
    payload.length > 2048 ||
    !/^[\x20-\x7e]+$/.test(payload)
  )
    fail(422, "QR นี้ไม่ใช่ QR พร้อมเพย์รับเงิน");
  const p = tlv(payload);
  if (
    !/6304[0-9A-Fa-f]{4}$/.test(payload) ||
    crc16(payload.slice(0, -4)) !== p["63"]?.toUpperCase()
  )
    fail(422, "QR เสียหาย: checksum ไม่ถูกต้อง");
  if (
    p["00"] !== "01" ||
    p["01"] !== "11" ||
    p["53"] !== "764" ||
    p["58"] !== "TH" ||
    ["54", "55", "56", "57"].some((tag) => p[tag] !== undefined) ||
    Object.keys(p).some((k) => +k >= 26 && +k <= 51 && k !== "29")
  )
    fail(422, "ใช้ QR พร้อมเพย์แบบไม่ระบุยอดเงินและไม่หมดอายุเท่านั้น");
  const a = tlv(p["29"] || ""),
    keys = Object.keys(a).filter((k) => k !== "00");
  if (
    a["00"] !== "A000000677010111" ||
    keys.length !== 1 ||
    !["01", "02"].includes(keys[0])
  )
    fail(422, "รองรับ QR พร้อมเพย์เบอร์โทรหรือเลขประจำตัวผู้เสียภาษีเท่านั้น");
  const type = keys[0],
    identifier = a[type];
  if (!(type === "01" ? /^0066\d{9}$/ : /^\d{13}$/).test(identifier))
    fail(422, "เลขพร้อมเพย์ใน QR ไม่ถูกต้อง");
  return {
    type,
    identifier: type === "01" ? "0" + identifier.slice(4) : identifier,
  };
}
export async function decodePaymentQr(buffer) {
  const { data, info } = await sharp(buffer)
    .rotate()
    .resize({
      width: 1600,
      height: 1600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: "white" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = new Uint8ClampedArray(data),
    qr = jsQR(pixels, info.width, info.height);
  if (!qr) fail(422, "อ่าน QR ไม่ได้ กรุณาใช้รูป QR ที่ชัดเจนและมีขอบขาวครบ");
  // Reject multiple codes: hide the first code and look for another recipient.
  const corners = [
    qr.location.topLeftCorner,
    qr.location.topRightCorner,
    qr.location.bottomLeftCorner,
    qr.location.bottomRightCorner,
  ];
  const x0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.x))) - 3),
    x1 = Math.min(
      info.width,
      Math.ceil(Math.max(...corners.map((p) => p.x))) + 3,
    );
  const y0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.y))) - 3),
    y1 = Math.min(
      info.height,
      Math.ceil(Math.max(...corners.map((p) => p.y))) + 3,
    );
  for (let y = y0; y < y1; y++)
    pixels.fill(255, (y * info.width + x0) * 4, (y * info.width + x1) * 4);
  if (jsQR(pixels, info.width, info.height))
    fail(422, "รูปต้องมี QR รับเงินเพียงรหัสเดียว");
  // Project the original QR pixels into a square with a four-module quiet zone.
  // This is display geometry only; payment data and the downloadable original stay intact.
  const left = Math.min(...corners.map((p) => p.x)),
    right = Math.max(...corners.map((p) => p.x));
  const top = Math.min(...corners.map((p) => p.y)),
    bottom = Math.max(...corners.map((p) => p.y));
  const dimension = 17 + 4 * qr.version,
    span = Math.max(right - left, bottom - top);
  const size = (span * (dimension + 8)) / dimension;
  return {
    ...parsePaymentPayload(qr.data),
    payloadHash: hash(qr.data),
    frame: {
      width: info.width,
      height: info.height,
      size,
      left: (left + right - size) / 2,
      top: (top + bottom - size) / 2,
      codeLeft: Math.max(0, Math.floor(left) - 1),
      codeTop: Math.max(0, Math.floor(top) - 1),
      codeRight: Math.min(info.width, Math.ceil(right) + 1),
      codeBottom: Math.min(info.height, Math.ceil(bottom) + 1),
    },
  };
}
const digits = (s) => String(s || "").replace(/[-\s]/g, "");
const name = (s) =>
  String(s || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
export async function verifyPaymentQr(db, config, buffer, settings) {
  const credentialHash = hash(secret(db, "easyslipApiKey", config));
  const decoded = await decodePaymentQr(buffer),
    accounts = [];
  // This endpoint only returns accounts linked to the API key's Branch.
  for (let page = 1; page <= 100; page++) {
    const data = await easyRequest(
      db,
      config,
      `bank-accounts?limit=100&page=${page}`,
    );
    if (!Array.isArray(data?.items) || !Number.isInteger(data.total))
      fail(502, "ข้อมูลบัญชีจาก EasySlip ไม่สมบูรณ์");
    accounts.push(...data.items);
    if (accounts.length >= data.total) break;
    if (!data.items.length || page === 100)
      fail(502, "อ่านบัญชี EasySlip ไม่ครบ กรุณาลองใหม่");
  }
  const sameNames = (a) =>
    !!name(settings.accountName) &&
    !!name(settings.accountNameEn) &&
    name(a.nameTh) === name(settings.accountName) &&
    name(a.nameEn) === name(settings.accountNameEn);
  const bank = accounts.find(
    (a) =>
      a.bankCode === settings.bankCode &&
      digits(a.bankNumber) === digits(settings.bankNumber) &&
      sameNames(a),
  );
  if (!bank)
    fail(
      422,
      "บัญชีธนาคารและชื่อผู้รับต้องลงทะเบียนและเชื่อมโยงกับ Branch ของ API key ใน EasySlip ก่อน",
    );
  const promptpay = accounts.find(
    (a) =>
      a.bankCode === "PROMPTPAY" &&
      digits(a.bankNumber) === decoded.identifier &&
      sameNames(a),
  );
  if (!promptpay)
    fail(
      422,
      "เลขพร้อมเพย์ใน QR และชื่อผู้รับไม่ตรงกับบัญชี PROMPTPAY ที่ลงทะเบียนใน Branch ของ EasySlip กรุณาลงทะเบียนและเชื่อมโยงบัญชีให้ครบ",
    );
  if (credentialHash !== hash(secret(db, "easyslipApiKey", config)))
    fail(409, "API key เปลี่ยนระหว่างตรวจสอบ กรุณาลองใหม่");
  return {
    version: 1,
    bankAccountId: bank.id,
    promptpayAccountId: promptpay.id,
    promptpayIdentifier: decoded.identifier,
    payloadHash: decoded.payloadHash,
    frame: decoded.frame,
    credentialHash,
    checkedAt: now(),
  };
}

export async function authorizeSlipPromptpay(db, config, data) {
  if (data?.matchedAccount?.bank?.code !== "PROMPTPAY") return;
  const settings = getSettings(db),
    credentialHash = hash(secret(db, "easyslipApiKey", config));
  const qr = currentPaymentQr(settings, credentialHash);
  if (!qr)
    fail(
      422,
      "สลิปโอนเข้าพร้อมเพย์ แต่ร้านยังไม่มี QR รับเงินที่ผ่านการตรวจบัญชีและ Branch กรุณาติดต่อร้าน",
    );
  const media = db
    .prepare("SELECT body FROM media WHERE id=? AND kind='paymentQr'")
    .get(qr.split("/").at(-1));
  if (!media) fail(422, "ไม่พบ QR พร้อมเพย์ที่ร้านยืนยันไว้");
  // Recheck the uploaded QR's exact identifier and both account registrations
  // against the current API key's Branch, including legacy QR verification data.
  const proof = await verifyPaymentQr(
    db,
    config,
    Buffer.from(media.body),
    settings,
  );
  if (digits(data.matchedAccount.bankNumber) !== proof.promptpayIdentifier)
    fail(422, "เลขพร้อมเพย์ผู้รับไม่ตรงกับ QR รับเงินของร้าน");
  const live = getSettings(db);
  if (
    JSON.stringify([
      live.bankCode,
      live.bankNumber,
      live.accountName,
      live.accountNameEn,
      live.paymentQr,
      live.paymentQrReceiver,
      live.paymentQrVerification,
    ]) !==
    JSON.stringify([
      settings.bankCode,
      settings.bankNumber,
      settings.accountName,
      settings.accountNameEn,
      settings.paymentQr,
      settings.paymentQrReceiver,
      settings.paymentQrVerification,
    ])
  )
    fail(409, "บัญชีรับเงินหรือ QR เปลี่ยนระหว่างตรวจสอบ กรุณาลองใหม่");
  authorizePromptpayResponse(data, settings, proof.promptpayIdentifier);
}
