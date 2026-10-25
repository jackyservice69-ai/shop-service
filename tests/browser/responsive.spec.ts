import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("mobile navigation and filters retain keyboard focus, drafts and reset behavior", async ({
  page,
}) => {
  const auth = await page.request.post("/api/auth/login", {
    data: { email: "admin@e2e.test", password: "Test-strong-password-2026!" },
  });
  expect(auth.ok()).toBe(true);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/products");
  const account = page.locator(".account-navigation > summary");
  await account.click();
  await expect(
    page.getByRole("link", { name: "ที่อยู่จัดส่ง", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(account).toBeFocused();
  await expect(page.locator(".account-navigation")).not.toHaveAttribute("open");
  await account.click();
  await page
    .locator(".account-navigation")
    .getByRole("link", { name: "กระเป๋าเงิน", exact: true })
    .click();
  await expect(page).toHaveURL("/wallet");
  await expect(page.locator("#main-content")).toBeFocused();
  await page
    .getByRole("navigation", { name: "เมนูหน้าร้าน" })
    .getByRole("link", { name: "เลือกซื้อสินค้า", exact: true })
    .click();
  const showFilters = page.getByRole("button", {
    name: "แสดงตัวกรอง",
    exact: true,
  });
  const minimum = page.getByLabel("ราคาต่ำสุด", { exact: true });
  const maximum = page.getByLabel("ราคาสูงสุด", { exact: true });
  await expect(showFilters).toHaveAttribute("aria-expanded", "false");
  await expect(minimum).toBeHidden();
  await showFilters.click();
  await expect(minimum).toHaveCSS("font-size", "16px");
  await minimum.fill("250");
  await maximum.fill("100");
  await page.getByRole("button", { name: "ใช้ช่วงราคา", exact: true }).click();
  await expect(maximum).toBeFocused();
  await expect(maximum).toHaveAttribute("aria-invalid", "true");
  await page.getByRole("button", { name: "ซ่อนตัวกรอง", exact: true }).click();
  await expect(showFilters).toBeFocused();
  await expect(minimum).toBeHidden();
  await showFilters.click();
  await expect(minimum).toHaveValue("250");
  await expect(maximum).toHaveAttribute("aria-invalid", "true");
  await page
    .getByRole("button", { name: "ดูรายการสินค้า", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "รายการสินค้า" }),
  ).toBeFocused();
  await expect(minimum).toBeHidden();
  await page
    .getByRole("searchbox", { name: "ค้นหาสินค้า", exact: true })
    .fill("ไม่พบสินค้า");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("q"))
    .toBe("ไม่พบสินค้า");
  await page.getByRole("button", { name: "ล้างคำค้นหา", exact: true }).click();
  await showFilters.click();
  await expect(minimum).toHaveValue("");
  await expect(maximum).toHaveValue("");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator(".loading")).toHaveCount(0);
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    scan.violations.map((v) => ({
      id: v.id,
      targets: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await page.setViewportSize({ width: 1440, height: 1080 });
  await expect(minimum).toBeVisible();
  await expect(showFilters).toBeHidden();
});

test("catalog reflows with long names and maximum prices at phone, tablet and desktop widths", async ({
  page,
}) => {
  await page.route("**/api/products?*", async (route) => {
    const response = await route.fetch();
    const original = await response.json();
    const item = original.items[0];
    await route.fulfill({
      json: {
        ...original,
        total: 2,
        items: [
          {
            ...item,
            id: "responsive-a",
            name: "กระเป๋ารุ่นพิเศษที่มีชื่อสินค้ายาวมากสำหรับตรวจสอบการตัดบรรทัด",
            price: 100000000,
            stock: 9999,
          },
          {
            ...item,
            id: "responsive-b",
            name: "สินค้าอีกชิ้นสำหรับตรวจสอบการแสดงราคาและรีวิวในพื้นที่แคบ",
            price: 99999999,
            stock: 1,
          },
        ],
      },
    });
  });
  await page.goto("/products");
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator(".product-card")).toHaveCount(2);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      String(width),
    ).toBe(true);
    const purchaseButtons = page.locator(".catalog-page .add-cart");
    const box = (await purchaseButtons.first().boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await expect(page.locator(".product-title").first()).toHaveCSS(
      "font-size",
      "14px",
    );
    const columns = await page
      .locator(".product-grid")
      .evaluate(
        (e) => getComputedStyle(e).gridTemplateColumns.split(" ").length,
      );
    expect(columns, String(width)).toBe(width < 360 ? 1 : width < 1100 ? 2 : 3);
  }
});
