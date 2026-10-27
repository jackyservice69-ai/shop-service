import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";

test("logo and shop-name links open a scoped storefront with filters, pagination, product details, cart, unavailable/error/empty states", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(90000);
  const contexts = [],
    prefix = "หน้าร้าน " + crypto.randomUUID().slice(0, 7);
  const admin = await browser.newContext({ baseURL });
  contexts.push(admin);
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
  const bytes = await sharp({
    create: { width: 600, height: 400, channels: 3, background: "#f6c2c2" },
  })
    .png()
    .toBuffer();
  async function shop(suffix: string, approved = true, images = false) {
    const context = await browser.newContext({ baseURL });
    contexts.push(context);
    const registration = await context.request.post("/api/auth/register", {
      data: {
        firstName: "เจ้าของร้าน",
        lastName: suffix,
        phone: "0812345678",
        email: crypto.randomUUID() + "@publicshop.test",
        password: "Test-strong-password-2026!",
      },
    });
    expect(registration.ok()).toBe(true);
    const member = await registration.json();
    async function upload(path: string) {
      const r = await context.request.post(path, {
        headers: { "x-csrf-token": member.csrf },
        multipart: {
          image: { name: "image.png", mimeType: "image/png", buffer: bytes },
        },
      });
      expect(r.ok()).toBe(true);
      return (await r.json()).url;
    }
    const logo = images ? await upload("/api/profile/media/shopLogo") : "",
      image = images ? await upload("/api/profile/media/shop") : "";
    expect(
      (
        await context.request.post("/api/consignment/apply", {
          headers: { "x-csrf-token": member.csrf },
          data: {
            shopName: prefix + suffix,
            acceptTerms: true,
            logo,
            image,
            serviceArea: "กรุงเทพฯ\nจัดส่งทั่วประเทศ",
          },
        })
      ).ok(),
    ).toBe(true);
    const membership = (
      await (await context.request.get("/api/consignment")).json()
    ).membership;
    if (approved)
      expect(
        (
          await admin.request.put("/api/admin/consignments/" + member.user.id, {
            headers: { "x-csrf-token": adminCsrf },
            data: { status: "approved", note: "", version: membership.version },
          })
        ).ok(),
      ).toBe(true);
    return { context, member, membership, upload };
  }
  async function product(
    s: any,
    name: string,
    category: string,
    image: string,
    approve = true,
    stock = 1,
  ) {
    expect(
      (
        await s.context.request.post("/api/consignment/products", {
          headers: { "x-csrf-token": s.member.csrf },
          data: {
            name,
            description: "สินค้าของ " + s.membership.shop_name,
            category,
            price: 10000,
            stock,
            image,
          },
        })
      ).ok(),
    ).toBe(true);
    const p = (
      await (
        await s.context.request.get("/api/consignment/products?size=50")
      ).json()
    ).items.find((p: any) => p.name === name);
    if (approve)
      expect(
        (
          await admin.request.put("/api/admin/consignment-products/" + p.id, {
            headers: { "x-csrf-token": adminCsrf },
            data: { approved: true, version: p.version },
          })
        ).ok(),
      ).toBe(true);
    return p;
  }
  try {
    const a = await shop(" A", true, true),
      b = await shop(" B"),
      empty = await shop(" ว่าง"),
      pending = await shop(" รออนุมัติ", false);
    const aImage = await a.upload("/api/consignment/media"),
      bImage = await b.upload("/api/consignment/media");
    const products = [];
    for (let n = 1; n <= 13; n++)
      products.push(
        await product(
          a,
          `${prefix} A ${String(n).padStart(2, "0")}`,
          n % 2 ? "กระเป๋า" : "น้ำหอม",
          aImage,
          true,
          n === 13 ? 0 : 1,
        ),
      );
    await product(a, prefix + " ร่าง", "หมวดร่างส่วนตัว", aImage, false);
    await product(b, prefix + " B", "หมวดร้านอื่น", bImage);
    const publicId = a.membership.public_id,
      storeUrl = "/shops/" + publicId,
      shopName = a.membership.shop_name;
    await page.goto("/products?q=" + encodeURIComponent(products[0].name));
    await page
      .getByRole("button", {
        name: "ดูรายละเอียด " + products[0].name,
        exact: true,
      })
      .click();
    const detail = page.getByRole("dialog", {
      name: products[0].name,
      exact: true,
    });
    await detail
      .getByRole("link", { name: "ดูหน้าร้าน " + shopName, exact: true })
      .getByRole("img", { name: "โลโก้ร้าน " + shopName, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(storeUrl + "$"));
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: shopName, level: 1, exact: true }),
    ).toBeVisible();
    await expect(page.locator(".product-card")).toHaveCount(12);
    await expect(page.locator(".seller-store-header")).not.toContainText(
      "กรุงเทพฯ",
    );
    await expect(page.locator(".seller-store-area")).toHaveCount(0);
    await expect(page.locator(".seller-store-count")).toHaveText(
      "สินค้า 13 รายการ",
    );
    await expect(page.locator(".product-grid")).not.toContainText(
      prefix + " B",
    );
    await expect(page.locator(".product-grid")).not.toContainText(
      prefix + " ร่าง",
    );
    const categories = await page
      .getByRole("combobox", { name: "หมวดหมู่", exact: true })
      .locator("option")
      .allTextContents();
    expect(categories).not.toContain("หมวดร้านอื่น");
    expect(categories).not.toContain("หมวดร่างส่วนตัว");
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.screenshot({
        path: `output/playwright/public-shop-${width}.png`,
      });
    }
    await page.getByRole("button", { name: "หน้าถัดไป", exact: true }).click();
    await expect(page.locator(".product-card")).toHaveCount(1);
    await page.reload();
    await expect(page.locator(".product-card")).toHaveCount(1);
    await page
      .getByRole("searchbox", { name: "ค้นหาสินค้าในร้านนี้", exact: true })
      .fill(products[12].name);
    await page
      .getByRole("button", { name: "ค้นหาในร้าน", exact: true })
      .click();
    await expect(page.locator(".product-card")).toHaveCount(1);
    await expect(page.locator(".product-card")).toContainText(
      products[12].name,
    );
    await page
      .getByRole("searchbox", { name: "ค้นหาสินค้าในร้านนี้", exact: true })
      .fill("");
    await page
      .getByRole("button", { name: "ค้นหาในร้าน", exact: true })
      .click();
    await expect(page.locator(".product-card")).toHaveCount(12);
    await page
      .getByRole("button", {
        name: "เพิ่ม " + products[11].name + " ลงตะกร้า",
        exact: true,
      })
      .click();
    await expect(page.locator(".cart-button")).toHaveAccessibleName(
      "ตะกร้า 1 ชิ้น",
    );
    await page
      .getByRole("button", {
        name: "ดูรายละเอียด " + products[11].name,
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("link", { name: "ดูหน้าร้าน " + shopName, exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.goto("/products?q=" + encodeURIComponent(products[0].name));
    await page
      .locator(".product-card")
      .getByRole("link", { name: "ดูหน้าร้าน " + shopName, exact: true })
      .getByText(shopName, { exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: shopName, level: 1, exact: true }),
    ).toBeVisible();
    let fail = true;
    await page.route("**/api/shops/" + publicId, async (route) => {
      if (fail) {
        fail = false;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "โหลดร้านไม่สำเร็จ ลองอีกครั้ง" }),
        });
      } else await route.continue();
    });
    await page.reload();
    await expect(page.getByRole("alert")).toContainText("โหลดร้านไม่สำเร็จ");
    await page
      .getByRole("button", { name: "ลองอีกครั้ง", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: shopName, level: 1, exact: true }),
    ).toBeVisible();
    await page.goto("/shops/" + empty.membership.public_id);
    await expect(
      page.getByText("ร้านนี้ยังไม่มีสินค้าที่เปิดขาย ลองกลับมาดูใหม่ภายหลัง", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator(".product-card")).toHaveCount(0);
    const productRequests: string[] = [];
    page.on("request", (request) => {
      if (
        new URL(request.url()).pathname === "/api/products" &&
        !new URL(request.url()).searchParams.has("ids")
      )
        productRequests.push(request.url());
    });
    await page.goto("/shops/" + pending.membership.public_id);
    await expect(page.getByRole("alert")).toContainText(
      "ไม่พบร้านนี้หรือร้านยังไม่เปิดให้บริการ",
    );
    await expect(page.locator(".product-card")).toHaveCount(0);
    expect(productRequests).toEqual([]);
  } finally {
    for (const context of contexts) await context.close();
  }
});
