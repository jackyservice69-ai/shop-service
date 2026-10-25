import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import sharp from "sharp";
import AxeBuilder from "@axe-core/playwright";
const password = "Test-strong-password-2026!";
const dates = {
  starts_at: "2020-01-01T00:00:00.000Z",
  ends_at: "2099-01-01T00:00:00.000Z",
};
async function image(jpeg = false) {
  const s = sharp({
    create: { width: 128, height: 128, channels: 3, background: "#c4b5ed" },
  });
  return jpeg ? s.jpeg().toBuffer() : s.png().toBuffer();
}
async function admin(page: Page) {
  await page.goto("/login?next=/admin/appearance");
  await page.getByLabel("อีเมล").fill("admin@e2e.test");
  await page.getByLabel("รหัสผ่าน").fill(password);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "สีและภาพลักษณ์ร้าน" }),
  ).toBeVisible();
  return (await (await page.request.get("/api/me")).json()).csrf;
}
async function put(
  request: APIRequestContext,
  csrf: string,
  path: string,
  data: any,
  method = "PUT",
) {
  const r = await request.fetch("/api" + path, {
    method,
    data,
    headers: { "x-csrf-token": csrf },
  });
  expect(r.ok(), await r.text()).toBe(true);
  return r.json();
}
async function upload(request: APIRequestContext, csrf: string, kind: string) {
  const r = await request.post("/api/admin/media/" + kind, {
    headers: { "x-csrf-token": csrf },
    multipart: {
      image: {
        name: "image.png",
        mimeType: "image/png",
        buffer: await image(),
      },
    },
  });
  expect(r.status()).toBe(201);
  return (await r.json()).url;
}
async function deactivate(
  request: APIRequestContext,
  csrf: string,
  resource: string,
  ids: string[],
) {
  const rows = (
    await (await request.get("/api/admin/" + resource + "?size=50")).json()
  ).items;
  for (const row of rows.filter((r: any) => ids.includes(r.id)))
    await put(request, csrf, "/admin/" + resource + "/" + row.id, {
      ...row,
      active: false,
      claim_required: !!row.claim_required,
    });
}

test("appearance editor persists branding without changing the rate; commission settings live on the commissions page", async ({
  page,
}) => {
  const csrf = await admin(page),
    initial = await (await page.request.get("/api/admin/appearance")).json();
  try {
    await page.getByRole("button", { name: "ชมพู–ฟ้า", exact: true }).click();
    await page.getByLabel("รหัสสี muted").fill("#675a75");
    await page.getByLabel("ไฟล์โลโก้", { exact: true }).setInputFiles({
      name: "logo.jpg",
      mimeType: "image/jpeg",
      buffer: await image(true),
    });
    await expect(page.locator(".image-uploader").first()).toContainText(
      "จัดเก็บ",
    );
    await page.getByLabel("ไฟล์Favicon", { exact: true }).setInputFiles({
      name: "icon.png",
      mimeType: "image/png",
      buffer: await image(),
    });
    await expect(page.locator(".image-uploader").nth(1)).toContainText(
      "จัดเก็บ 256 × 256",
    );
    await expect(page.locator(".image-uploader").nth(1)).toContainText(
      "พื้นหลังทึบ",
    );
    await expect(page.locator(".transparency-preview")).toHaveCSS(
      "background-image",
      /conic-gradient/,
    );
    await expect(page.getByLabel("ค่าคอมมิชชั่นแนะนำเพื่อน")).toHaveCount(0);
    await page.getByRole("button", { name: "บันทึก", exact: true }).click();
    await expect(page.locator(".toast")).toContainText(
      "บันทึกสีและภาพลักษณ์ร้านแล้ว",
    );
    expect(
      (await (await page.request.get("/api/admin/commissions/settings")).json())
        .commissionPercent,
    ).toBe(initial.commissionPercent);
    await page
      .getByRole("link", { name: "ค่าคอมมิชชั่น", exact: true })
      .click();
    const rate = page.getByLabel("ค่าคอมมิชชั่นแนะนำเพื่อน");
    await rate.fill("101");
    await page
      .getByRole("button", { name: "บันทึกอัตราค่าคอมมิชชั่น", exact: true })
      .click();
    await expect(rate).toBeFocused();
    await rate.fill("7.25");
    await page
      .getByRole("button", { name: "บันทึกอัตราค่าคอมมิชชั่น", exact: true })
      .click();
    await expect(page.locator(".toast")).toContainText(
      "บันทึกอัตราค่าคอมมิชชั่นแล้ว",
    );
    await page.reload();
    await expect(page.getByLabel("ค่าคอมมิชชั่นแนะนำเพื่อน")).toHaveValue(
      "7.25",
    );
    expect(
      (await (await page.request.get("/api/admin/appearance")).json()).theme
        .muted,
    ).toBe("#675a75");
    await page.goto("/");
    await expect(page.locator(".store-header .custom-brand img")).toBeVisible();
    expect(await page.locator("link[rel=icon]").getAttribute("href")).toMatch(
      /^\/api\/media\//,
    );
    expect(
      await page
        .locator(".customer-shell")
        .evaluate((e) =>
          getComputedStyle(e).getPropertyValue("--primary").trim(),
        ),
    ).toBe("#f6c2c2");
    const cta = page.getByRole("link", { name: "เลือกช้อปของที่ชอบ" });
    await cta.hover();
    await expect(cta).toHaveCSS("background-color", "rgb(242, 168, 168)");
    await page.mouse.down();
    await expect(cta).toHaveCSS("background-color", "rgb(235, 141, 141)");
    await page.mouse.up();
    await page.mouse.move(0, 0);
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      scan.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
    await page.screenshot({
      path: "output/playwright/pastel-store.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const mobileScan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      mobileScan.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
    ).toEqual([]);
    await page.screenshot({
      path: "output/playwright/pink-sky-mobile.png",
      fullPage: true,
    });
    const saved = await (
      await page.request.get("/api/admin/appearance")
    ).json();
    await put(page.request, csrf, "/admin/appearance", {
      ...saved,
      theme: {
        ...saved.theme,
        primary: "#888888",
        surface: "#252525",
        background: "#191919",
        ink: "#ffffff",
        muted: "#dddddd",
      },
    });
    await page.goto("/account");
    const email = page.getByLabel("รหัสผ่านปัจจุบัน");
    expect(
      await email.evaluate((e) => getComputedStyle(e).backgroundColor),
    ).toBe("rgb(37, 37, 37)");
    expect(await email.evaluate((e) => getComputedStyle(e).color)).toBe(
      "rgb(255, 255, 255)",
    );
  } finally {
    await put(page.request, csrf, "/admin/appearance", initial);
  }
});

test("multiple image banners and announcements cycle, pause, wrap, respect reduced motion and remember dismissal; back-to-top works on mobile", async ({
  page,
}) => {
  const csrf = await admin(page),
    initial = await (await page.request.get("/api/admin/appearance")).json(),
    bids: string[] = [],
    aids: string[] = [];
  try {
    await put(page.request, csrf, "/admin/appearance", {
      ...initial,
      slideSeconds: 3,
    });
    const bi = await upload(page.request, csrf, "banner"),
      ai = await upload(page.request, csrf, "announcement");
    for (let i = 1; i <= 2; i++) {
      bids.push(
        (
          await put(
            page.request,
            csrf,
            "/admin/banners",
            {
              title: "แบนเนอร์ " + i,
              image: bi,
              link: "/promotions",
              position: i,
              active: true,
              ...dates,
            },
            "POST",
          )
        ).id,
      );
      aids.push(
        (
          await put(
            page.request,
            csrf,
            "/admin/announcements",
            {
              title: "ประกาศ " + i,
              body: "เนื้อหาประกาศ " + i,
              image: ai,
              position: i,
              active: true,
              ...dates,
            },
            "POST",
          )
        ).id,
      );
    }
    await page.clock.install();
    await page.goto("/");
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "ประกาศ 1", exact: true }),
    ).toBeVisible();
    await page.clock.fastForward(3100);
    await expect(
      dialog.getByRole("heading", { name: "ประกาศ 2", exact: true }),
    ).toBeVisible();
    await dialog
      .getByRole("button", { name: "ประกาศร้าน ถัดไป", exact: true })
      .click();
    await expect(
      dialog.getByRole("heading", { name: "ประกาศ 1", exact: true }),
    ).toBeVisible();
    await dialog
      .getByRole("button", { name: "หยุดสไลด์", exact: true })
      .click();
    await page.clock.fastForward(7000);
    await expect(
      dialog.getByRole("heading", { name: "ประกาศ 1", exact: true }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "รับทราบ", exact: true }).click();
    const banner = page.getByRole("region", {
      name: "แบนเนอร์ร้าน",
      exact: true,
    });
    await banner
      .getByRole("button", { name: "แบนเนอร์ร้าน 1", exact: true })
      .click();
    await expect(
      banner.getByAltText("แบนเนอร์ 1", { exact: true }),
    ).toBeVisible();
    await banner
      .getByRole("button", { name: "แบนเนอร์ร้าน ถัดไป", exact: true })
      .click();
    await expect(
      banner.getByAltText("แบนเนอร์ 2", { exact: true }),
    ).toBeVisible();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.mouse.click(5, 150);
    await page.clock.fastForward(7000);
    await expect(
      banner.getByAltText("แบนเนอร์ 2", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => scrollTo(0, 1000));
    const top = page.getByRole("button", {
      name: "กลับสู่ด้านบน",
      exact: true,
    });
    await expect(top).toBeVisible();
    const box = await top.boundingBox();
    expect(box?.x).toBeLessThan(30);
    await top.click();
    expect(await page.evaluate(() => scrollY)).toBe(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await deactivate(page.request, csrf, "banners", bids);
    await deactivate(page.request, csrf, "announcements", aids);
    await put(page.request, csrf, "/admin/appearance", initial);
  }
});

test("admin uploads promotion image, member collects coupon then applies server-calculated discount", async ({
  page,
  browser,
}) => {
  const csrf = await admin(page);
  let pid = "";
  const context = await browser.newContext();
  try {
    await page.goto("/admin/promotions");
    await page
      .getByRole("button", { name: "เพิ่มโปรโมชั่น", exact: true })
      .click();
    const modal = page.getByRole("dialog");
    await modal.getByLabel("โค้ดส่วนลด").fill("COLLECTBROWSER");
    await modal.getByLabel("ชื่อโปรโมชั่น").fill("โปรโมชั่นรูปภาพ");
    await modal.getByLabel("มูลค่าส่วนลด").fill("20");
    await modal.getByLabel("ต้องเก็บคูปองก่อนใช้ส่วนลด").check();
    await modal.getByLabel("ไฟล์โปรโมชั่น", { exact: true }).setInputFiles({
      name: "promo.jpeg",
      mimeType: "image/jpeg",
      buffer: await image(true),
    });
    await expect(modal.locator(".image-uploader")).toContainText("จัดเก็บ");
    await modal.getByRole("button", { name: "บันทึก", exact: true }).click();
    await expect(
      page.getByText("COLLECTBROWSER", { exact: true }),
    ).toBeVisible();
    pid = (
      await (
        await page.request.get("/api/admin/promotions?q=COLLECTBROWSER")
      ).json()
    ).items[0].id;
    const r = await context.request.post("/api/auth/register", {
      data: {
        firstName: "ผู้รับ",
        lastName: "คูปอง",
        phone: "0812345678",
        email: "coupon-" + crypto.randomUUID() + "@example.test",
        password,
      },
    });
    expect(r.status()).toBe(200);
    const customer = await context.newPage();
    await customer.goto("/coupons");
    const card = customer.locator(".promo-card").filter({
      has: customer.getByRole("heading", { name: "โปรโมชั่นรูปภาพ" }),
    });
    await expect(card.getByAltText("โปรโมชั่นรูปภาพ")).toBeVisible();
    await card
      .getByRole("button", { name: "เก็บคูปองรับส่วนลด", exact: true })
      .click();
    await expect(card.getByRole("link", { name: "ใช้คูปองนี้" })).toBeVisible();
    await customer.goto("/products");
    await customer
      .getByRole("button", { name: "เพิ่ม สินค้าทดสอบ ลงตะกร้า" })
      .click();
    await customer.goto("/coupons");
    await customer
      .locator(".promo-card")
      .filter({
        has: customer.getByRole("heading", { name: "โปรโมชั่นรูปภาพ" }),
      })
      .getByRole("link", { name: "ใช้คูปองนี้" })
      .click();
    await expect(customer.getByLabel("โค้ดโปรโมชั่น")).toHaveValue(
      "COLLECTBROWSER",
    );
    await expect(customer.locator(".summary-lines")).toContainText("−฿20");
    await customer.setViewportSize({ width: 390, height: 844 });
    expect(
      await customer.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await context.close();
    if (pid) await deactivate(page.request, csrf, "promotions", [pid]);
  }
});

test("banner editor supports image upload, dimensions, edit and deactivate", async ({
  page,
}) => {
  const csrf = await admin(page);
  let bid = "";
  try {
    await page.goto("/admin/banners");
    await page
      .getByRole("button", { name: "เพิ่มแบนเนอร์", exact: true })
      .click();
    const modal = page.getByRole("dialog");
    await expect(modal).toContainText("1600 × 600 px");
    await modal
      .getByLabel("หัวข้อแบนเนอร์ / คำอธิบายรูป")
      .fill("แบนเนอร์จากฟอร์ม");
    await modal.getByLabel("ไฟล์แบนเนอร์", { exact: true }).setInputFiles({
      name: "banner.jpg",
      mimeType: "image/jpeg",
      buffer: await image(true),
    });
    await expect(modal.locator(".image-uploader")).toContainText("จัดเก็บ");
    await modal.getByRole("button", { name: "บันทึก", exact: true }).click();
    await expect(
      page.getByText("แบนเนอร์จากฟอร์ม", { exact: true }),
    ).toBeVisible();
    bid = (
      await (await page.request.get("/api/admin/banners?size=50")).json()
    ).items.find((b: any) => b.title === "แบนเนอร์จากฟอร์ม").id;
    await page.getByRole("button", { name: "แก้ไข แบนเนอร์จากฟอร์ม" }).click();
    await page.getByRole("dialog").getByLabel("เปิดแสดง").uncheck();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "บันทึก", exact: true })
      .click();
    await expect(
      page.locator("tr").filter({ hasText: "แบนเนอร์จากฟอร์ม" }),
    ).toContainText("ปิดแสดง");
  } finally {
    if (bid) await deactivate(page.request, csrf, "banners", [bid]);
  }
});
