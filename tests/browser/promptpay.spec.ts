import { test, expect } from "@playwright/test";
import QRCode from "qrcode";
import sharp from "sharp";
import { paymentPayload } from "../payment-data.mjs";
const password = "Test-strong-password-2026!";

test("customer tops up 100 baht from a PromptPay slip when the registered shop QR is active", async ({
  page,
  browser,
}) => {
  const owner = await browser.newContext({ baseURL: "http://127.0.0.1:4319" });
  const auth = await owner.request.post("/api/auth/login", {
    data: { email: "admin@e2e.test", password },
  });
  expect(auth.ok()).toBe(true);
  const csrf = (await auth.json()).csrf;
  const settings = await (
    await owner.request.get("/api/admin/settings")
  ).json();
  try {
    const upload = await owner.request.post("/api/admin/media/paymentQr", {
      headers: { "x-csrf-token": csrf },
      multipart: {
        image: {
          name: "shop-qr.png",
          mimeType: "image/png",
          buffer: await QRCode.toBuffer(paymentPayload()),
        },
      },
    });
    expect(upload.ok()).toBe(true);
    const saved = await owner.request.put("/api/admin/settings", {
      headers: { "x-csrf-token": csrf },
      data: { ...settings, paymentQr: (await upload.json()).url },
    });
    expect(saved.ok()).toBe(true);
    const created = await page.request.post("/api/auth/register", {
      data: {
        firstName: "ลูกค้า",
        lastName: "พร้อมเพย์",
        phone: "0812345678",
        email: crypto.randomUUID() + "@example.test",
        password,
      },
    });
    expect(created.ok()).toBe(true);
    await page.goto("/wallet");
    await expect(page.locator(".payment-qr-image")).toBeVisible();
    await page.getByLabel("จำนวนเงินที่โอน (บาท)").fill("100");
    await page.getByLabel("เลือกรูปสลิป").setInputFiles({
      name: "promptpay-slip.png",
      mimeType: "image/png",
      buffer: await sharp({
        create: { width: 37, height: 39, channels: 3, background: "#f6c2c2" },
      })
        .png()
        .toBuffer(),
    });
    await page.request.post("/__test/promptpay-slip", { data: {} });
    await page.getByRole("button", { name: "ตรวจสอบสลิปและเติมเงิน" }).click();
    await expect(page.locator(".wallet-card strong")).toHaveText("฿100");
    await expect(
      page.getByRole("cell", { name: "เติมเงิน", exact: true }),
    ).toHaveCount(1);
    expect(
      (await (await page.request.get("/api/me")).json()).user.balance,
    ).toBe(10000);
  } finally {
    const restored = await owner.request.put("/api/admin/settings", {
      headers: { "x-csrf-token": csrf },
      data: settings,
    });
    expect(restored.ok()).toBe(true);
    await owner.close();
  }
});
