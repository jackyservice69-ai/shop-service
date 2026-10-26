import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";

test("seller uses category dropdown and multi-image editor; saved edits, admin review and storefront preserve the gallery", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(60000);
  const admin = await browser.newContext({ baseURL }),
    visitor = await browser.newContext({ baseURL });
  const productName = "สินค้าชุดรูป " + crypto.randomUUID().slice(0, 7),
    category = "หมวดตัวแทน " + crypto.randomUUID().slice(0, 7);
  try {
    const registered = await page.request.post("/api/auth/register", {
      data: {
        firstName: "ตัวแทนหลายรูป",
        lastName: "ทดสอบ",
        phone: "0812345678",
        email: crypto.randomUUID() + "@gallery.test",
        password: "Test-strong-password-2026!",
      },
    });
    expect(registered.ok()).toBe(true);
    const member = await registered.json();
    expect(
      (
        await page.request.post("/api/consignment/apply", {
          headers: { "x-csrf-token": member.csrf },
          data: { shopName: "ร้าน " + productName, acceptTerms: true },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await admin.request.post("/api/auth/login", {
          data: {
            email: "admin@e2e.test",
            password: "Test-strong-password-2026!",
          },
        })
      ).ok(),
    ).toBe(true);
    const adminCsrf = (await (await admin.request.get("/api/me")).json()).csrf;
    expect(
      (
        await admin.request.put("/api/admin/consignments/" + member.user.id, {
          headers: { "x-csrf-token": adminCsrf },
          data: { status: "approved", note: "", version: 1 },
        })
      ).ok(),
    ).toBe(true);
    await page.goto("/consignment");
    await page
      .getByRole("button", { name: "เพิ่มสินค้าฝากขาย", exact: true })
      .click();
    let dialog = page.getByRole("dialog", {
      name: "เพิ่มสินค้าฝากขาย",
      exact: true,
    });
    await dialog
      .getByRole("textbox", { name: "ชื่อสินค้า", exact: true })
      .fill(productName);
    await dialog
      .getByLabel("รายละเอียดสินค้า")
      .fill("ตัวแทนเพิ่มหมวดและรูปหลายใบ");
    await dialog
      .getByRole("combobox", { name: "หมวดหมู่" })
      .selectOption("__new_category__");
    await dialog
      .getByRole("button", { name: "ส่งตรวจสินค้าฝากขาย", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toContainText(
      "กรุณาตรวจสอบข้อมูลที่ระบุ",
    );
    await dialog.getByLabel("ชื่อหมวดหมู่ใหม่").fill(category);
    await dialog.getByLabel("ราคาขาย (บาท)").fill("250");
    await dialog.getByLabel("จำนวนพร้อมขาย").fill("3");
    await dialog
      .getByRole("button", { name: "ส่งตรวจสินค้าฝากขาย", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toContainText("อย่างน้อย 1 รูป");
    const image = async (name: string, background: string) => ({
      name,
      mimeType: "image/png",
      buffer: await sharp({
        create: { width: 128, height: 128, channels: 3, background },
      })
        .png()
        .toBuffer(),
    });
    await dialog
      .getByLabel("เพิ่มรูปภาพสินค้า", { exact: true })
      .setInputFiles([
        await image("pink.png", "pink"),
        {
          name: "broken.png",
          mimeType: "image/png",
          buffer: Buffer.from("invalid png"),
        },
        await image("gold.png", "gold"),
      ]);
    await expect(dialog.locator(".product-image-item")).toHaveCount(2);
    await expect(
      dialog.locator(".product-images-editor").getByRole("alert"),
    ).toContainText("broken.png");
    await dialog
      .getByRole("button", { name: "ใช้เป็นรูปหลัก", exact: true })
      .click();
    const firstPrimary = await dialog
      .locator(".product-image-item img")
      .first()
      .getAttribute("src");
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        (await new AxeBuilder({ page }).include("dialog[open]").analyze())
          .violations,
      ).toEqual([]);
      await dialog.screenshot({
        path: `output/playwright/consignor-product-editor-${width}.png`,
      });
    }
    await dialog
      .getByRole("button", { name: "ส่งตรวจสินค้าฝากขาย", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    const row = page.getByRole("row").filter({ hasText: productName });
    await expect(row).toContainText("รออนุมัติ");
    let stored = (
      await (await page.request.get("/api/consignment/products")).json()
    ).items.find((p: any) => p.name === productName);
    expect(stored.images).toHaveLength(2);
    expect(stored.image).toBe(firstPrimary);
    await row.getByRole("button").click();
    dialog = page.getByRole("dialog", {
      name: "แก้ไขสินค้าฝากขาย",
      exact: true,
    });
    await expect(
      dialog.getByRole("combobox", { name: "หมวดหมู่" }),
    ).toHaveValue(category);
    await expect(dialog.locator(".product-image-item")).toHaveCount(2);
    await dialog
      .getByRole("button", { name: "ใช้เป็นรูปหลัก", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "ลบรูปสินค้า 2", exact: true })
      .click();
    await dialog
      .getByLabel("เพิ่มรูปภาพสินค้า", { exact: true })
      .setInputFiles(await image("mint.png", "#d5f5e3"));
    await expect(dialog.locator(".product-image-item")).toHaveCount(2);
    await dialog
      .getByRole("combobox", { name: "หมวดหมู่" })
      .selectOption("กระเป๋า");
    await dialog
      .getByRole("button", { name: "ส่งตรวจสินค้าฝากขาย", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    stored = (
      await (await page.request.get("/api/consignment/products")).json()
    ).items.find((p: any) => p.name === productName);
    expect(stored.category).toBe("กระเป๋า");
    expect(stored.image).not.toBe(firstPrimary);
    const adminPage = await admin.newPage();
    await adminPage.goto("/admin/consignments?tab=products");
    await adminPage
      .getByRole("button", { name: "ตรวจสินค้า " + productName, exact: true })
      .click();
    const review = adminPage.getByRole("dialog", {
      name: "ตรวจสินค้าฝากขาย",
      exact: true,
    });
    await expect(
      review.locator(".product-gallery-thumbnails button"),
    ).toHaveCount(2);
    await review
      .getByRole("button", { name: "ดูรูปสินค้า 2", exact: true })
      .click();
    await expect(review.locator(".detail-image")).toHaveAttribute(
      "src",
      stored.images[1],
    );
    await review
      .getByRole("button", { name: "ยืนยันผลตรวจสินค้า", exact: true })
      .click();
    await expect(review).toHaveCount(0);
    const publicPage = await visitor.newPage();
    await publicPage.goto("/products?q=" + encodeURIComponent(productName));
    await publicPage
      .getByRole("button", { name: "ดูรายละเอียด " + productName, exact: true })
      .click();
    const detail = publicPage.getByRole("dialog", {
      name: productName,
      exact: true,
    });
    await expect(detail.locator(".detail-image")).toHaveAttribute(
      "src",
      stored.image,
    );
    await detail
      .getByRole("button", { name: "ดูรูปสินค้า 2", exact: true })
      .click();
    await expect(detail.locator(".detail-image")).toHaveAttribute(
      "src",
      stored.images[1],
    );
  } finally {
    await admin.close();
    await visitor.close();
  }
});
