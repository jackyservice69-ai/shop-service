import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";

const photo = async () => ({
  name: "profile.jpg",
  mimeType: "image/jpeg",
  buffer: await sharp({
    create: { width: 800, height: 600, channels: 3, background: "#f6c2c2" },
  })
    .jpeg()
    .toBuffer(),
});
async function register(context: any) {
  const response = await context.request.post("/api/auth/register", {
    data: {
      firstName: "ทดสอบรูป",
      lastName: "หน้าร้าน",
      phone: "0812345678",
      email: crypto.randomUUID() + "@profiles.test",
      password: "Test-strong-password-2026!",
    },
  });
  expect(response.ok()).toBe(true);
  return response.json();
}
async function fits(page: any) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

test("customer uploads, saves, reloads and removes a private profile photo with usable mobile and desktop layouts", async ({
  page,
}) => {
  await register(page.context());
  await page.goto("/account");
  const section = page.getByRole("region", { name: "รูปโปรไฟล์", exact: true });
  await section.getByLabel("ไฟล์รูปโปรไฟล์").setInputFiles({
    name: "wrong.png",
    mimeType: "image/png",
    buffer: Buffer.from("not a png"),
  });
  await expect(section.getByRole("alert")).toContainText("ภาพไม่สมบูรณ์");
  await section.getByLabel("ไฟล์รูปโปรไฟล์").setInputFiles(await photo());
  await expect(section.getByRole("status")).toContainText("512 × 512");
  await section
    .getByRole("button", { name: "บันทึกรูปโปรไฟล์", exact: true })
    .click();
  const avatar = page
    .getByRole("link", { name: "บัญชีของฉัน", exact: true })
    .locator("img");
  await expect(avatar).toBeVisible();
  const url = await avatar.getAttribute("src");
  await page.reload();
  await expect(avatar).toHaveAttribute("src", url!);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    await fits(page);
    expect(
      (await new AxeBuilder({ page }).include(".account-photo").analyze())
        .violations,
    ).toEqual([]);
    await section.scrollIntoViewIfNeeded();
    await section.screenshot({
      path: `output/playwright/account-photo-${width}.png`,
    });
  }
  // A failed photo remains a usable account link with the existing icon.
  await page.route("**" + url, (route) => route.abort());
  await page.reload();
  await expect(
    page.getByRole("link", { name: "บัญชีของฉัน", exact: true }).locator("svg"),
  ).toBeVisible();
  await page.unroute("**" + url);
  await section.getByRole("button", { name: "เอารูปออก", exact: true }).click();
  await section
    .getByRole("button", { name: "บันทึกรูปโปรไฟล์", exact: true })
    .click();
  await expect(avatar).toHaveCount(0);
  expect((await (await page.request.get("/api/me")).json()).user.avatar).toBe(
    "",
  );
});

test("seller adds a shop photo and service area, approver sees them, and approved public products display the updated shop", async ({
  page,
  browser,
  baseURL,
}) => {
  const admin = await browser.newContext({ baseURL });
  const publicContext = await browser.newContext({ baseURL });
  try {
    const member = await register(page.context()),
      name = "ร้านรูป " + crypto.randomUUID().slice(0, 6);
    const area = "กรุงเทพฯ • เขตบางรัก\nนนทบุรี / จัดส่งทั่วประเทศ";
    await page.goto("/consignment");
    await page.getByLabel("ชื่อร้านตัวแทน").fill(name);
    const logoFile = {
      name: "shop-logo.png",
      mimeType: "image/png",
      buffer: await sharp({
        create: {
          width: 1024,
          height: 512,
          channels: 4,
          background: { r: 246, g: 194, b: 194, alpha: 0.5 },
        },
      })
        .png()
        .toBuffer(),
    };
    await page.getByLabel("ไฟล์โลโก้ร้าน").setInputFiles(logoFile);
    await expect(
      page.getByRole("status").filter({ hasText: "512 × 256" }),
    ).toBeVisible();
    await page.getByLabel("ไฟล์รูปหน้าร้าน").setInputFiles(await photo());
    await expect(
      page.getByRole("status").filter({ hasText: "800 × 600" }),
    ).toBeVisible();
    await page.getByLabel("พื้นที่ให้บริการ", { exact: true }).fill(area);
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "ส่งคำขอสมัคร", exact: true })
      .click();
    const editor = page.getByRole("region", {
      name: "โลโก้ รูปหน้าร้าน และพื้นที่ให้บริการ",
      exact: true,
    });
    await expect(editor).toBeVisible();
    await expect(
      page.locator(".panel-title .badge.status-reserved"),
    ).toHaveText("รออนุมัติ");
    let membership = (await (await page.request.get("/api/consignment")).json())
      .membership;
    expect((await publicContext.request.get(membership.image)).status()).toBe(
      404,
    );
    expect((await publicContext.request.get(membership.logo)).status()).toBe(
      404,
    );
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
    const adminPage = await admin.newPage();
    await adminPage.goto("/admin/consignments");
    await adminPage
      .getByRole("row")
      .filter({ hasText: name })
      .getByRole("button")
      .click();
    const dialog = adminPage.getByRole("dialog", {
      name: "จัดการสมาชิกตัวแทน",
      exact: true,
    });
    await expect(
      dialog.getByRole("img", { name: "รูปหน้าร้าน " + name }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("img", { name: "โลโก้ร้าน " + name, exact: true }),
    ).toBeVisible();
    await expect(dialog.locator(".shop-information")).toContainText("นนทบุรี");
    await dialog
      .getByRole("button", { name: "ยืนยันสถานะตัวแทน", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await page.reload();
    await expect(page.locator(".badge.status-approved")).toHaveText(
      "อนุมัติแล้ว",
    );
    await expect(page.locator(".badge.status-approved")).toHaveCSS(
      "background-color",
      "rgb(226, 242, 213)",
    );
    await expect(page.locator(".badge.status-approved")).toHaveCSS(
      "color",
      "rgb(45, 106, 79)",
    );
    await expect(
      page.getByRole("img", { name: "โลโก้ร้าน " + name, exact: true }),
    ).toBeVisible();
    await editor
      .getByLabel("พื้นที่ให้บริการ", { exact: true })
      .fill(area + "\nรับส่งตามนัด 10:00–18:00 น.");
    await editor
      .getByRole("button", { name: "บันทึกข้อมูลหน้าร้าน", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "บันทึกข้อมูลหน้าร้านแล้ว" }),
    ).toBeVisible();
    await page.reload();
    await expect(
      editor.getByLabel("พื้นที่ให้บริการ", { exact: true }),
    ).toHaveValue(area + "\nรับส่งตามนัด 10:00–18:00 น.");
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 950 });
      await fits(page);
      expect(
        (
          await new AxeBuilder({ page })
            .include('[aria-labelledby="shop-profile-heading"]')
            .analyze()
        ).violations,
      ).toEqual([]);
      await editor.scrollIntoViewIfNeeded();
      await editor.screenshot({
        path: `output/playwright/shop-profile-${width}.png`,
      });
    }
    const image = await photo();
    const uploaded = await page.request.post("/api/consignment/media", {
      headers: { "x-csrf-token": member.csrf },
      multipart: {
        image: {
          name: image.name,
          mimeType: image.mimeType,
          buffer: image.buffer,
        },
      },
    });
    expect(uploaded.ok()).toBe(true);
    const added = await page.request.post("/api/consignment/products", {
      headers: { "x-csrf-token": member.csrf },
      data: {
        name: "สินค้ารูปร้าน " + name,
        description: "ทดสอบรายละเอียดผู้ขาย",
        category: "กระเป๋า",
        price: 10000,
        stock: 1,
        image: (await uploaded.json()).url,
      },
    });
    expect(added.ok()).toBe(true);
    const products = (
      await (await page.request.get("/api/consignment/products")).json()
    ).items;
    const product = products[0],
      adminCsrf = (await (await admin.request.get("/api/me")).json()).csrf;
    expect(
      (
        await admin.request.put(
          "/api/admin/consignment-products/" + product.id,
          {
            headers: { "x-csrf-token": adminCsrf },
            data: { approved: true, version: product.version },
          },
        )
      ).ok(),
    ).toBe(true);
    const publicPage = await publicContext.newPage();
    await publicPage.setViewportSize({ width: 390, height: 950 });
    await publicPage.goto("/products?q=" + encodeURIComponent(product.name));
    await publicPage
      .getByRole("button", {
        name: "ดูรายละเอียด " + product.name,
        exact: true,
      })
      .click();
    const detail = publicPage.getByRole("dialog", {
      name: product.name,
      exact: true,
    });
    await expect(
      detail.getByRole("region", { name: "ข้อมูลร้านผู้ขาย" }),
    ).not.toContainText("รับส่งตามนัด");
    await expect(
      detail.getByRole("region", { name: "ข้อมูลร้านผู้ขาย" }),
    ).not.toContainText("นนทบุรี");
    await expect(
      detail.getByRole("img", { name: "รูปหน้าร้าน " + name }),
    ).toBeVisible();
    await expect(
      detail.getByRole("img", { name: "โลโก้ร้าน " + name, exact: true }),
    ).toHaveAttribute("src", membership.logo);
    await fits(publicPage);
    expect(
      (
        await new AxeBuilder({ page: publicPage })
          .include(".shop-information")
          .analyze()
      ).violations,
    ).toEqual([]);
    await detail.screenshot({
      path: "output/playwright/public-shop-information-390.png",
    });
    const logoUploader = editor
      .locator(".image-uploader")
      .filter({ has: page.getByLabel("ไฟล์โลโก้ร้าน") });
    await logoUploader
      .getByRole("button", { name: "เอารูปออก", exact: true })
      .click();
    await editor
      .getByRole("button", { name: "บันทึกข้อมูลหน้าร้าน", exact: true })
      .click();
    await expect(
      page.getByRole("img", { name: "โลโก้ร้าน " + name, exact: true }),
    ).toHaveCount(0);
    expect((await publicContext.request.get(membership.logo)).status()).toBe(
      404,
    );
    expect(
      (await (await page.request.get("/api/consignment")).json()).membership
        .image,
    ).toBe(membership.image);
  } finally {
    await admin.close();
    await publicContext.close();
  }
});
