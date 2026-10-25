import { test, expect } from "@playwright/test";

test("home and catalog are separate; left filters preserve URL state, validate prices and reset without losing search", async ({
  page,
}) => {
  const loggedIn = await page.request.post("/api/auth/login", {
    data: {
      email: "admin@e2e.test",
      password: "Test-strong-password-2026!",
    },
  });
  expect(loggedIn.ok()).toBe(true);
  const csrf = (await loggedIn.json()).csrf;
  const prefix = "catalog-" + crypto.randomUUID();
  const category = prefix + "-หมวด";
  const ids: string[] = [];
  try {
    for (const [suffix, price, stock, cat] of [
      ["A", 12000, 4, category],
      ["B", 25000, 0, category],
      ["C", 45000, 5, prefix + "-อื่น"],
    ] as const) {
      const created = await page.request.post("/api/admin/products", {
        headers: { "x-csrf-token": csrf },
        data: {
          name: prefix + suffix,
          description: "ทดสอบตัวกรอง",
          category: cat,
          price,
          cost: 1000,
          stock,
          image: "/assets/bag.svg",
          active: true,
        },
      });
      expect(created.status(), await created.text()).toBe(201);
      ids.push((await created.json()).id);
    }
    await page.goto("/");
    await expect(page.locator(".product-card")).toHaveCount(0);
    const menu = page.getByRole("navigation", { name: "เมนูหน้าร้าน" });
    const labels = await menu.getByRole("link").allTextContents();
    expect(labels.slice(0, 2)).toEqual(["หน้าหลัก", "เลือกซื้อสินค้า"]);
    expect(labels.slice(-2)).toEqual(["ที่อยู่จัดส่ง", "ติดต่อเรา"]);
    const adminIcon = page.getByRole("link", { name: "หลังบ้าน", exact: true });
    await expect(adminIcon).toHaveCSS("border-radius", "50%");
    expect((await adminIcon.boundingBox())?.width).toBe(44);
    expect((await adminIcon.boundingBox())?.height).toBe(44);

    await page
      .getByRole("searchbox", { name: "ค้นหาสินค้า", exact: true })
      .fill(prefix);
    await page.getByRole("button", { name: "ค้นหา", exact: true }).click();
    await expect(page).toHaveURL(new RegExp("/products\\?q=" + prefix));
    await expect(page.locator(".product-card")).toHaveCount(3);
    const sidebar = page.getByRole("complementary", { name: "กรองสินค้า" });
    expect((await sidebar.boundingBox())!.x).toBeLessThan(
      (await page.getByRole("region", { name: "รายการสินค้า" }).boundingBox())!
        .x,
    );
    await page.getByLabel("หมวดหมู่", { exact: true }).selectOption(category);
    await expect(page.locator(".product-card")).toHaveCount(2);
    await page.getByRole("button", { name: "ค้นหา", exact: true }).click();
    expect(new URL(page.url()).searchParams.get("category")).toBe(category);
    await expect(page.locator(".product-card")).toHaveCount(2);
    await page.getByLabel("เฉพาะสินค้าที่มีในสต็อก").check();
    await expect(page.locator(".product-card")).toHaveCount(1);
    await page.getByLabel("ราคาต่ำสุด", { exact: true }).fill("300");
    await page.getByLabel("ราคาสูงสุด", { exact: true }).fill("100");
    await page
      .getByRole("button", { name: "ใช้ช่วงราคา", exact: true })
      .click();
    await expect(page.getByLabel("ราคาสูงสุด", { exact: true })).toBeFocused();
    await expect(
      page.getByText("ราคาสูงสุดต้องไม่น้อยกว่าราคาต่ำสุด", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("ราคาต่ำสุด", { exact: true }).fill("100");
    await page.getByLabel("ราคาสูงสุด", { exact: true }).fill("300");
    await page
      .getByRole("button", { name: "ใช้ช่วงราคา", exact: true })
      .click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("minPrice"))
      .toBe("10000");
    await page
      .getByLabel("เรียงสินค้า", { exact: true })
      .selectOption("price-desc");
    await page.getByLabel("เฉพาะสินค้าที่มีในสต็อก").uncheck();
    await expect(page.locator(".product-card")).toHaveCount(2);
    await expect(page.locator(".product-title").first()).toHaveText(
      prefix + "B",
    );
    await page.reload();
    await expect(page.getByLabel("ราคาต่ำสุด", { exact: true })).toHaveValue(
      "100",
    );
    await expect(page.getByLabel("ราคาสูงสุด", { exact: true })).toHaveValue(
      "300",
    );
    await page.goBack();
    await expect(page.getByLabel("เฉพาะสินค้าที่มีในสต็อก")).toBeChecked();
    await expect(page.locator(".product-card")).toHaveCount(1);
    await page.goForward();
    await expect(page.getByLabel("เฉพาะสินค้าที่มีในสต็อก")).not.toBeChecked();
    await page
      .getByRole("button", { name: "ล้างตัวกรอง", exact: true })
      .click();
    await expect(page.locator(".product-card")).toHaveCount(3);
    await expect(page.getByLabel("ราคาต่ำสุด", { exact: true })).toHaveValue(
      "",
    );
    expect(new URL(page.url()).searchParams.get("q")).toBe(prefix);
    await page.setViewportSize({ width: 375, height: 900 });
    await expect(page.locator(".loading")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect((await sidebar.boundingBox())!.y).toBeLessThan(
      (await page.getByRole("region", { name: "รายการสินค้า" }).boundingBox())!
        .y,
    );
    await page.goto("/?q=" + prefix);
    await expect(page).toHaveURL(new RegExp("/products\\?q=" + prefix));
    await expect(page.locator(".product-card")).toHaveCount(3);
    await page.getByLabel("ราคาต่ำสุด", { exact: true }).fill("999");
    await page.getByLabel("ราคาสูงสุด", { exact: true }).fill("100");
    await page
      .getByRole("button", { name: "ใช้ช่วงราคา", exact: true })
      .click();
    await expect(page.getByRole("alert")).toBeVisible();
    await page
      .getByRole("button", { name: "ล้างคำค้นหา", exact: true })
      .click();
    await expect(page).toHaveURL("/products");
    await expect(page.getByLabel("ราคาต่ำสุด", { exact: true })).toHaveValue(
      "",
    );
    await expect(page.getByLabel("ราคาสูงสุด", { exact: true })).toHaveValue(
      "",
    );
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.goto("/cart");
    await page
      .getByRole("link", { name: "ไปเลือกสินค้า", exact: true })
      .click();
    await expect(page).toHaveURL("/products");
  } finally {
    const rows = (
      await (
        await page.request.get("/api/admin/products?size=50&q=" + prefix)
      ).json()
    ).items;
    for (const row of rows.filter((row: any) => ids.includes(row.id))) {
      const response = await page.request.put("/api/admin/products/" + row.id, {
        headers: { "x-csrf-token": csrf },
        data: { ...row, active: false },
      });
      expect(response.ok(), await response.text()).toBe(true);
    }
  }
});
