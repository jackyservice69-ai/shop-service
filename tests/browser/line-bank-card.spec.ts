import { test, expect } from "@playwright/test";
import QRCode from "qrcode";
import sharp from "sharp";
import jsQR from "jsqr";
import { mkdir } from "node:fs/promises";
import { paymentPayload } from "../payment-data.mjs";

test("LINE bank image crops the shared panel, keeps Thai fonts and decodable shop QR, and excludes customer controls", async ({
  page,
  browser,
}) => {
  const owner = await browser.newContext({ baseURL: "http://127.0.0.1:4319" });
  const auth = await owner.request.post("/api/auth/login", {
    data: { email: "admin@e2e.test", password: "Test-strong-password-2026!" },
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
    await page.goto("/bank-details-card");
    await expect(page.locator(".panel.bank-details")).toBeVisible();
    await expect(page.locator(".payment-qr-image")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(() =>
        document.fonts.check('600 16px "Noto Sans Thai"'),
      ),
    ).toBe(true);
    await expect(
      page.locator(".store-header, .store-footer, .wallet-card"),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "บันทึก QR" })).toHaveCount(
      0,
    );
    const { fingerprint } = await (
      await page.request.post("/__test/bank-card", { data: {} })
    ).json();
    for (const [size, width] of [
      ["original", 1080],
      ["preview", 540],
    ] as const) {
      // This invokes the real server-side Chromium capture, not a stub renderer.
      const response = await page.request.get(
        `/api/line/bank-card/${fingerprint}/${size}.png`,
      );
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toContain("image/png");
      const png = await response.body();
      expect(png.length).toBeLessThan(
        size === "preview" ? 1024 * 1024 : 10 * 1024 * 1024,
      );
      const { data, info } = await sharp(png)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect(info.width).toBe(width);
      expect(info.height).toBeLessThan(1200);
      expect(
        jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data,
      ).toBe(paymentPayload());
      await mkdir("output/playwright", { recursive: true });
      await sharp(png).toFile(
        `output/playwright/line-bank-card-${size}-test.png`,
      );
    }
  } finally {
    expect(
      (
        await owner.request.put("/api/admin/settings", {
          headers: { "x-csrf-token": csrf },
          data: settings,
        })
      ).ok(),
    ).toBe(true);
    await owner.close();
  }
});
