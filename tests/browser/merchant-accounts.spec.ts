import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import QRCode from "qrcode";
import { paymentPayload } from "../payment-data.mjs";

test("owner imports a bank, manages multiple primary QR images and visibility; wallet selection works on desktop and mobile", async ({
  page,
  browser,
}) => {
  const login = await page.request.post("/api/auth/login", {
    data: { email: "admin@e2e.test", password: "Test-strong-password-2026!" },
  });
  expect(login.ok()).toBe(true);
  const previous = await (
    await page.request.post("/__test/merchant-state")
  ).json();
  const customer = await browser.newContext({
    baseURL: "http://127.0.0.1:4319",
  });
  try {
    let branchUnavailable = true;
    await page.route("**/api/admin/merchant-accounts/branch", (route) =>
      branchUnavailable
        ? route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ error: "Branch temporarily unavailable" }),
          })
        : route.continue(),
    );
    await page.goto("/admin/merchant-accounts");
    await page.getByRole("button", { name: "เพิ่มบัญชี", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("alert")).toContainText(
      "Branch temporarily unavailable",
    );
    branchUnavailable = false;
    await dialog.getByRole("button", { name: "ลองอีกครั้ง" }).click();
    await dialog.getByLabel("บัญชีใน EasySlip").selectOption("201");
    await dialog.getByLabel("ชื่อเรียกบัญชี").fill("บัญชีเติมเงินสำรอง");
    await dialog.getByLabel("ใช้เป็นรายการหลัก").check();
    await dialog.getByRole("button", { name: "บันทึก", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const article = page.locator(".merchant-account").filter({
      has: page.getByRole("heading", {
        name: "บัญชีเติมเงินสำรอง",
        exact: true,
      }),
    });
    await expect(article).toContainText("9876543210");
    for (const label of ["QR หนึ่ง", "QR สอง"]) {
      await article
        .getByRole("button", { name: "เพิ่ม QR", exact: true })
        .click();
      await dialog.getByLabel("ชื่อ QR").fill(label);
      await dialog.getByLabel("ไฟล์QR รับเงิน", { exact: true }).setInputFiles({
        name: "second-bank.png",
        mimeType: "image/png",
        buffer: await QRCode.toBuffer(paymentPayload("9876543210123"), {
          width: 600,
        }),
      });
      await expect(dialog.locator(".image-uploader")).toContainText(
        "ตรวจสอบเลขพร้อมเพย์",
      );
      await dialog.getByLabel("ใช้เป็นรายการหลัก").check();
      await dialog.getByRole("button", { name: "บันทึก", exact: true }).click();
      await expect(dialog).toHaveCount(0);
    }
    const state = (
      await (await page.request.get("/api/admin/merchant-accounts")).json()
    ).items;
    const second = state.find((a: any) => a.bankNumber === "9876543210");
    expect(second.qrs).toHaveLength(2);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: "output/playwright/merchant-accounts-mobile.png",
      fullPage: true,
    });
    await article
      .getByRole("button", { name: "แก้ไขบัญชี", exact: true })
      .click();
    await expect(dialog.getByLabel("ชื่อเรียกบัญชี")).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.keyboard.press("Escape");

    const registration = await customer.request.post("/api/auth/register", {
      data: {
        firstName: "ลูกค้า",
        lastName: "หลายบัญชี",
        email: crypto.randomUUID() + "@example.test",
        phone: "0812345678",
        password: "Test-strong-password-2026!",
      },
    });
    expect(registration.ok()).toBe(true);
    const wallet = await customer.newPage();
    await wallet.goto("/wallet");
    await expect(wallet.getByLabel("เลือกบัญชีรับเงิน")).toHaveValue(second.id);
    await expect(wallet.locator(".payment-qr-image")).toHaveAttribute(
      "src",
      second.qrs[1].image,
    );
    await wallet.getByLabel("เลือก QR รับเงิน").selectOption(second.qrs[0].id);
    await expect(wallet.locator(".payment-qr-image")).toHaveAttribute(
      "src",
      second.qrs[0].image,
    );
    await wallet.getByLabel("เลือกบัญชีรับเงิน").selectOption("legacy");
    await expect(wallet.locator(".bank-number")).toHaveText("1234567890");
    await wallet.getByLabel("เลือกบัญชีรับเงิน").selectOption(second.id);
    await wallet.setViewportSize({ width: 390, height: 844 });
    expect(
      await wallet.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page: wallet })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await wallet.screenshot({
      path: "output/playwright/wallet-multiple-banks-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: "output/playwright/merchant-accounts-desktop.png",
      fullPage: true,
    });
    const unverified = await (
      await page.request.post("/__test/merchant-state")
    ).json();
    unverified.value.find(
      (a: any) => a.id === second.id,
    ).qrs[0].verification.credentialHash = "stale-test-proof";
    expect(
      (
        await page.request.put("/__test/merchant-state", { data: unverified })
      ).ok(),
    ).toBe(true);
    await page.reload();
    await article
      .getByRole("button", { name: "ตรวจสอบ QR ใหม่", exact: true })
      .click();
    await expect(
      article.getByRole("button", { name: "ตรวจสอบ QR ใหม่", exact: true }),
    ).toHaveCount(0);
    expect(
      (
        await (await page.request.get("/api/admin/merchant-accounts")).json()
      ).items.find((a: any) => a.id === second.id).qrs,
    ).toHaveLength(2);
    const qrTwo = article
      .locator(".merchant-qr-item")
      .filter({ hasText: "QR สอง" });
    await qrTwo.getByRole("button", { name: "แก้ไข QR", exact: true }).click();
    await dialog.getByLabel("แสดงบนหน้าร้าน").uncheck();
    await dialog.getByRole("button", { name: "บันทึก", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await wallet.reload();
    await expect(wallet.locator(".payment-qr-image")).toHaveAttribute(
      "src",
      second.qrs[0].image,
    );
    await expect(wallet.getByLabel("เลือก QR รับเงิน")).toHaveCount(0);
    await article
      .getByRole("button", { name: "แก้ไขบัญชี", exact: true })
      .click();
    await dialog.getByLabel("แสดงบนหน้าร้าน").uncheck();
    await dialog.getByRole("button", { name: "บันทึก", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await wallet.reload();
    await expect(wallet.locator(".bank-number")).toHaveText("1234567890");
    await expect(wallet.getByLabel("เลือกบัญชีรับเงิน")).toHaveCount(0);
    const legacyCard = page.locator(".merchant-account").filter({
      has: page.getByRole("heading", {
        name: "บัญชีรับเงินของร้าน",
        exact: true,
      }),
    });
    await legacyCard
      .getByRole("button", { name: "แก้ไขบัญชี", exact: true })
      .click();
    await dialog.getByLabel("แสดงบนหน้าร้าน").uncheck();
    await dialog.getByRole("button", { name: "บันทึก", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await wallet.reload();
    await expect(wallet.locator(".bank-details")).toContainText(
      "ยังไม่มีบัญชีที่เปิดแสดง",
    );
    await expect(wallet.locator(".bank-number")).toHaveCount(0);
    await expect(
      wallet.getByRole("button", {
        name: "ตรวจสอบสลิปและเติมเงิน",
        exact: true,
      }),
    ).toBeEnabled();
  } finally {
    expect(
      (
        await page.request.put("/__test/merchant-state", { data: previous })
      ).ok(),
    ).toBe(true);
    await customer.close();
  }
});
