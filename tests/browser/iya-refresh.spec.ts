import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";

test("restored category art, compact rounded hero and themed wallet stay usable on narrow and desktop screens", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".pastel-browse-card .art-beauty")).toHaveCount(1);
  await expect(page.locator(".pastel-browse-card .art-gadgets")).toHaveCount(1);
  const paths = await page
    .locator(
      '.quick-categories-track li[data-category-copy="1"] .pastel-category-art',
    )
    .evaluateAll((nodes) =>
      nodes.map((node) => getComputedStyle(node).backgroundImage),
    );
  expect(
    paths.filter((path) => path.includes("/assets/storefront/")),
  ).toHaveLength(14);
  for (const path of paths.filter((path) =>
    path.includes("/assets/storefront/"),
  )) {
    const url = path.match(/url\("?([^"\)]+)/)?.[1];
    expect(url).toBeTruthy();
    expect(
      await page.evaluate(async (url) => {
        const image = new Image();
        image.src = url!;
        try {
          await image.decode();
          return image.naturalWidth > 0;
        } catch {
          return false;
        }
      }, url),
    ).toBe(true);
  }
  expect(paths.some((path) => path.includes("iya-refresh-v5"))).toBe(false);
  await expect(page.locator(".pastel-browse-card .art-bag")).toHaveCSS(
    "background-image",
    /category-photos-hd/,
  );
  await expect(page.locator(".pastel-browse-card .art-beauty")).toHaveCSS(
    "background-image",
    /category-beauty-v4/,
  );
  await expect(page.locator(".pastel-browse-card .art-gadgets")).toHaveCSS(
    "background-image",
    /category-gadgets-v4/,
  );
  const publicData = await (await page.request.get("/api/public")).json();
  if (publicData.announcements?.length)
    await page
      .getByRole("dialog", { name: "ประกาศจากร้าน", exact: true })
      .getByRole("button", { name: "รับทราบ", exact: true })
      .click();
  for (const width of [320, 412, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const hero = page.locator(".reference-hero");
    expect(
      await hero.evaluate((node) =>
        parseFloat(getComputedStyle(node).marginTop),
      ),
    ).toBe(8);
    expect(
      await hero.evaluate((node) =>
        parseFloat(getComputedStyle(node).marginBottom),
      ),
    ).toBe(8);
    expect(
      await hero.evaluate((node) =>
        parseFloat(getComputedStyle(node).borderRadius),
      ),
    ).toBeGreaterThan(0);
    expect(
      await hero.evaluate((node) =>
        parseFloat(getComputedStyle(node).marginTop),
      ),
    ).toBe(8);
    expect(
      await hero.evaluate((node) =>
        parseFloat(getComputedStyle(node).marginBottom),
      ),
    ).toBe(8);
    // Catch whitespace baked into the image, which margin-only checks miss.
    const topPixel = await sharp(await hero.screenshot())
      .extract({
        left: Math.floor(
          width > 1000 ? 500 : (await hero.boundingBox())!.width / 2,
        ),
        top: 5,
        width: 1,
        height: 1,
      })
      .removeAlpha()
      .raw()
      .toBuffer();
    expect(topPixel[0] - topPixel[1]).toBeGreaterThan(10);
    expect(topPixel[1]).toBeLessThan(240);
    const card = (await hero.boundingBox())!,
      button = (await page.locator(".reference-hero-cta").boundingBox())!;
    expect(button.y).toBeGreaterThan(card.y);
    expect(button.y + button.height).toBeLessThan(card.y + card.height);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `output/playwright/iya-refresh-home-${width}.png`,
      fullPage: true,
    });
  }
  await page.request.post("/api/auth/login", {
    data: { email: "admin@e2e.test", password: "Test-strong-password-2026!" },
  });
  await page.goto("/wallet");
  await expect(
    page.getByRole("heading", { name: "บัญชีรับเงินของร้าน Iya", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".wallet-gold-coin")).toBeVisible();
  expect(await page.locator(".wallet-card strong").textContent()).not.toContain(
    "฿",
  );
  await page.setViewportSize({ width: 412, height: 1000 });
  await page.screenshot({
    path: "output/playwright/iya-refresh-wallet-412.png",
    fullPage: true,
  });
  expect(
    (
      await new AxeBuilder({ page })
        .include(".wallet-card")
        .include(".bank-details")
        .analyze()
    ).violations,
  ).toEqual([]);
});

test("owner creates a category and multi-photo product, handles bad upload, switches primary and browses gallery", async ({
  page,
}) => {
  const auth = await (
    await page.request.post("/api/auth/login", {
      data: { email: "admin@e2e.test", password: "Test-strong-password-2026!" },
    })
  ).json();
  await page.goto("/admin/products");
  await page.getByRole("button", { name: "เพิ่มสินค้า", exact: true }).click();
  const dialog = page.getByRole("dialog"),
    name = "สินค้ารูปใหม่ " + Date.now();
  let id = "";
  try {
    await dialog.getByLabel("ชื่อสินค้า", { exact: false }).fill(name);
    await dialog
      .getByLabel("หมวดหมู่", { exact: false })
      .selectOption("__new_category__");
    await dialog.getByLabel("ชื่อหมวดหมู่ใหม่").fill("อุปกรณ์เดินทางทดสอบ");
    await dialog.getByLabel("จำนวนคงเหลือ").fill("3");
    await dialog.getByLabel("ราคาขาย (บาท)").fill("100");
    await dialog.getByLabel("ต้นทุนต่อชิ้น (บาท)").fill("20");
    const png = await sharp({
      create: { width: 64, height: 64, channels: 3, background: "pink" },
    })
      .png()
      .toBuffer();
    const jpg = await sharp(png).jpeg().toBuffer();
    await dialog.getByLabel("เพิ่มรูปภาพสินค้า").setInputFiles([
      { name: "first.png", mimeType: "image/png", buffer: png },
      { name: "second.jpg", mimeType: "image/jpeg", buffer: jpg },
      {
        name: "broken.png",
        mimeType: "image/png",
        buffer: Buffer.from("invalid"),
      },
    ]);
    await expect(dialog.locator(".product-image-item")).toHaveCount(2);
    await expect(dialog.locator(".product-images-editor")).toContainText(
      "broken.png",
    );
    await expect(
      dialog.getByRole("button", { name: "ใช้เป็นรูปหลัก" }),
    ).toBeEnabled();
    const primary = await dialog
      .locator(".product-image-item img")
      .nth(1)
      .getAttribute("src");
    await dialog.getByRole("button", { name: "ใช้เป็นรูปหลัก" }).click();
    expect(
      await dialog
        .locator(".product-image-item img")
        .first()
        .getAttribute("src"),
    ).toBe(primary);
    await page.setViewportSize({ width: 375, height: 900 });
    expect(
      await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
    ).toBe(true);
    expect(
      (await new AxeBuilder({ page }).include("dialog").analyze()).violations,
    ).toEqual([]);
    await dialog.getByRole("button", { name: "บันทึก", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const product = (
      await (
        await page.request.get(
          "/api/admin/products?q=" + encodeURIComponent(name),
        )
      ).json()
    ).items[0];
    id = product.id;
    expect(product.images).toHaveLength(2);
    expect(product.image).toBe(primary);
    expect(product.category).toBe("อุปกรณ์เดินทางทดสอบ");
    await page.goto("/products?q=" + encodeURIComponent(name));
    await page
      .getByRole("button", { name: "ดูรายละเอียด " + name, exact: true })
      .click();
    await expect(
      page.locator(".product-gallery-thumbnails button"),
    ).toHaveCount(2);
    await page
      .getByRole("button", { name: "ดูรูปสินค้า 2", exact: true })
      .click();
    await expect(page.locator(".detail-image")).toHaveAttribute(
      "src",
      product.images[1],
    );
    await page.screenshot({
      path: "output/playwright/iya-refresh-product-gallery.png",
    });
  } finally {
    if (id) {
      const product = (
        await (
          await page.request.get(
            "/api/admin/products?q=" + encodeURIComponent(name),
          )
        ).json()
      ).items[0];
      await page.request.put("/api/admin/products/" + id, {
        headers: { "x-csrf-token": auth.csrf },
        data: { ...product, active: false },
      });
    }
  }
});

test("commission cap saves in baht, templates remain optional and selecting art does not publish a campaign", async ({
  page,
}) => {
  const auth = await (
    await page.request.post("/api/auth/login", {
      data: { email: "admin@e2e.test", password: "Test-strong-password-2026!" },
    })
  ).json();
  const initial = await (
    await page.request.get("/api/admin/commissions/settings")
  ).json();
  try {
    await page.goto("/admin/commissions");
    await page.getByLabel("ค่าคอมมิชชั่นแนะนำเพื่อน").fill("5");
    await page.getByLabel("ค่าคอมมิชชั่นสูงสุดต่อบิล (บาท)").fill("500");
    await page
      .getByRole("button", { name: "บันทึกอัตราค่าคอมมิชชั่น" })
      .click();
    await expect(page.locator(".toast")).toContainText(
      "บันทึกอัตราค่าคอมมิชชั่นแล้ว",
    );
    expect(
      (await (await page.request.get("/api/admin/commissions/settings")).json())
        .commissionCap,
    ).toBe(50000);
    await page.reload();
    await expect(
      page.getByLabel("ค่าคอมมิชชั่นสูงสุดต่อบิล (บาท)"),
    ).toHaveValue("500");
    for (const [resource, button] of [
      ["announcements", "เพิ่มประกาศ"],
      ["promotions", "เพิ่มโปรโมชั่น"],
    ]) {
      const before = await (
        await page.request.get("/api/admin/" + resource)
      ).json();
      await page.goto("/admin/" + resource);
      await page.getByRole("button", { name: button, exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.locator(".campaign-templates summary").click();
      await expect(dialog.locator(".campaign-template")).toHaveCount(4);
      await dialog.locator(".campaign-template").first().click();
      await expect(dialog.locator(".upload-preview img")).toHaveAttribute(
        "src",
        /^\/api\/media\//,
      );
      await dialog.getByRole("button", { name: "ยกเลิก", exact: true }).click();
      expect(
        (await (await page.request.get("/api/admin/" + resource)).json()).total,
      ).toBe(before.total);
    }
  } finally {
    await page.request.put("/api/admin/commissions/settings", {
      headers: { "x-csrf-token": auth.csrf },
      data: initial,
    });
  }
});
