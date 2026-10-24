import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import QRCode from "qrcode";
import sharp from "sharp";
import jsQR from "jsqr";
import { paymentPayload } from "../payment-data.mjs";

test("failed cart hydration preserves saved IDs and retry restores them", async ({
  page,
}) => {
  const catalog = await (await page.request.get("/api/products")).json();
  const pid = catalog.items[0].id;
  await page.addInitScript(
    ({ pid }) =>
      localStorage.setItem(
        "hiewly-cart",
        JSON.stringify([{ id: pid, quantity: 2 }]),
      ),
    { pid },
  );
  let failed = true;
  await page.route("**/api/products?size=50&ids=*", async (route) =>
    failed
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "unavailable" }),
        })
      : route.continue(),
  );
  await page.goto("/cart");
  await expect(page.getByRole("alert")).toContainText(
    "โหลดตะกร้าเดิมไม่สำเร็จ",
  );
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("hiewly-cart") || "[]")[0].quantity,
    ),
  ).toBe(2);
  failed = false;
  await page.getByRole("button", { name: "โหลดตะกร้าอีกครั้ง" }).click();
  await expect(page.getByRole("link", { name: "ตะกร้า 2 ชิ้น" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
const PASSWORD = "Test-strong-password-2026!";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl5kAAAAASUVORK5CYII=",
  "base64",
);
async function register(page: Page) {
  await page.goto("/register");
  await page.getByLabel("ชื่อหน้า").fill("ลูกค้า");
  await page.getByLabel("นามสกุล").fill("ทดสอบ");
  await page
    .getByRole("textbox", { name: "เบอร์โทร", exact: true })
    .fill("0812345678");
  await page
    .getByLabel("อีเมล")
    .fill("browser-" + crypto.randomUUID() + "@example.test");
  await page.getByLabel("รหัสผ่าน").fill(PASSWORD);
  await page.getByRole("button", { name: "สร้างบัญชี", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "ของที่ชอบ ให้เราหิ้วมาให้" }),
  ).toBeVisible();
  const publicData = await (await page.request.get("/api/public")).json();
  if (publicData.announcements?.length)
    await page
      .getByRole("dialog", { name: "ประกาศจากร้าน", exact: true })
      .getByRole("button", { name: "รับทราบ", exact: true })
      .click();
}
async function adminLogin(page: Page) {
  await page.goto("/login?next=/admin");
  await page.getByLabel("อีเมล").fill("admin@e2e.test");
  await page.getByLabel("รหัสผ่าน").fill(PASSWORD);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "ภาพรวมร้านค้า" }),
  ).toBeVisible();
}
test("registration validates phone, persists split profile and exposes contacts only in member admin", async ({
  page,
  browser,
}) => {
  await page.goto("/register");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "output/playwright/register-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "สร้างบัญชี", exact: true }).click();
  await expect(page.getByLabel("ชื่อหน้า")).toBeFocused();
  await page.getByLabel("ชื่อหน้า").fill("อรุณ");
  await page.getByLabel("นามสกุล").fill("แสงใส");
  await page
    .getByRole("textbox", { name: "เบอร์โทร", exact: true })
    .fill("not-a-phone");
  await page
    .getByLabel("อีเมล")
    .fill("profile-" + crypto.randomUUID() + "@example.test");
  await page.getByLabel("รหัสผ่าน").fill(PASSWORD);
  await page.getByLabel("รู้จักเราจากที่ไหน").fill("TikTok");
  await page.getByLabel("Line ID Add").fill("@profile.member");
  await page.getByRole("button", { name: "สร้างบัญชี", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "เบอร์โทร", exact: true }),
  ).toHaveAttribute("aria-invalid", "true");
  await expect(
    page.getByRole("textbox", { name: "เบอร์โทร", exact: true }),
  ).toBeFocused();
  await expect(page.getByLabel("ชื่อหน้า")).toHaveValue("อรุณ");
  await page
    .getByRole("textbox", { name: "เบอร์โทร", exact: true })
    .fill("081-234-5678");
  await page.getByRole("button", { name: "สร้างบัญชี", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "ของที่ชอบ ให้เราหิ้วมาให้" }),
  ).toBeVisible();
  const me = (await (await page.request.get("/api/me")).json()).user;
  expect(me).toMatchObject({
    firstName: "อรุณ",
    lastName: "แสงใส",
    name: "อรุณ แสงใส",
    phone: "0812345678",
    discoverySource: "TikTok",
    lineId: "@profile.member",
  });
  expect((await page.request.get("/api/admin/members")).status()).toBe(403);
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4319",
  });
  try {
    const adminPage = await context.newPage();
    await adminLogin(adminPage);
    await adminPage.goto("/admin/members");
    await adminPage.getByRole("searchbox").fill("profile.member");
    const row = adminPage.getByRole("row").filter({ hasText: "อรุณ แสงใส" });
    await expect(row).toContainText("0812345678");
    await expect(row).toContainText("LINE: @profile.member");
    await expect(row).toContainText("TikTok");
  } finally {
    await context.close();
  }
});
async function addAndCheckout(page: Page, payment = "deposit") {
  await page.goto("/");
  await page
    .getByRole("button", { name: "เพิ่ม สินค้าทดสอบ ลงตะกร้า" })
    .click();
  await page.getByRole("link", { name: /ตะกร้า/ }).click();
  await page
    .getByRole("radio")
    .nth(payment === "deposit" ? 1 : 0)
    .check();
  await expect(
    page.getByRole("button", { name: "ตรวจสอบและยืนยัน" }),
  ).toBeVisible();
  await page.getByLabel("เบอร์โทรศัพท์").fill("0812345678");
  await page
    .getByLabel("ที่อยู่จัดส่งและรหัสไปรษณีย์")
    .fill("123 ถนนทดสอบ กรุงเทพฯ 10110");
  await page.getByRole("button", { name: "ตรวจสอบและยืนยัน" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", { name: "ยืนยันคำสั่งซื้อ", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "คำสั่งซื้อของฉัน" }),
  ).toBeVisible();
}

test("store search, detail dialog, keyboard dismissal, cart persistence and narrow layout", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "ของที่ชอบ ให้เราหิ้วมาให้" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "ดูรายละเอียด สินค้าทดสอบ" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "ดูรายละเอียด สินค้าทดสอบ" }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "เพิ่ม สินค้าทดสอบ ลงตะกร้า" })
    .click();
  await page.reload();
  await expect(page.getByRole("link", { name: "ตะกร้า 1 ชิ้น" })).toBeVisible();
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("hiewly-cart") || "[]"),
  );
  expect(Object.keys(stored[0]).sort()).toEqual(["id", "quantity"]);
  await page.getByRole("searchbox").fill("ไม่พบสินค้า");
  await expect(page.getByText("ยังไม่พบสินค้า")).toBeVisible();
  await page.getByRole("searchbox").fill("");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "เพิ่ม สินค้าทดสอบ ลงตะกร้า" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "output/playwright/store-mobile.png",
    fullPage: true,
  });
});
test("register, 0% reserve, insufficient settlement, cancellation and referral QR", async ({
  page,
}) => {
  await register(page);
  await addAndCheckout(page);
  await expect(
    page.getByText("รอชำระส่วนที่เหลือ", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "ชำระส่วนที่เหลือ ฿100" }).click();
  await page
    .getByRole("button", { name: "ยืนยันชำระเงิน", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("ยอดเงินไม่เพียงพอ");
  await page.getByRole("button", { name: "ปิดหน้าต่าง" }).click();
  await page
    .getByRole("button", { name: "ยกเลิกคำสั่งซื้อ", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "ยกเลิกคำสั่งซื้อ", exact: true })
    .click();
  await expect(page.getByText("ยกเลิก", { exact: true })).toBeVisible();
  await page.goto("/referrals");
  await expect(
    page.getByAltText("QR Code สมัครสมาชิกผ่านการแนะนำของคุณ"),
  ).toBeVisible();
  await expect(page.getByLabel("ลิงก์แนะนำเพื่อน")).toHaveValue(
    /register\?ref=/,
  );
});
test("slip topup, full-wallet purchase and exact refund run through customer UI", async ({
  page,
}) => {
  await register(page);
  await page.goto("/wallet");
  await page.getByLabel("จำนวนเงินที่โอน (บาท)").fill("250");
  await page
    .getByLabel("เลือกรูปสลิป")
    .setInputFiles({ name: "slip.png", mimeType: "image/png", buffer: png });
  await page.getByRole("button", { name: "ตรวจสอบสลิปและเติมเงิน" }).click();
  await expect(page.locator(".wallet-card strong")).toHaveText("฿250");
  await expect(page.getByText("เติมเงิน", { exact: true })).toBeVisible();
  await addAndCheckout(page, "full");
  await expect(page.getByText("ชำระแล้ว", { exact: true })).toBeVisible();
  await page.goto("/wallet");
  await expect(page.locator(".wallet-card strong")).toHaveText("฿150");
  await page.goto("/orders");
  await page
    .getByRole("button", { name: "ยกเลิกคำสั่งซื้อ", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "ยกเลิกคำสั่งซื้อ", exact: true })
    .click();
  await page.goto("/wallet");
  await expect(page.locator(".wallet-card strong")).toHaveText("฿250");
  await expect(page.getByText("คืนเงิน", { exact: true })).toBeVisible();
});
test("admin visits every module and creates/updates product, promotion, announcement, finance and role", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await adminLogin(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "output/playwright/dashboard.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "จัดการสินค้า", exact: true }).click();
  await page.getByRole("button", { name: "เพิ่มสินค้า", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("ชื่อสินค้า")
    .fill("ใหม่จากบราวเซอร์");
  await page.getByLabel("รายละเอียด").fill("รายละเอียดทดสอบ");
  await page.getByLabel("จำนวนคงเหลือ").fill("2");
  await page.getByLabel("ราคาขาย (บาท)").fill("199");
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(
    page.getByText("ใหม่จากบราวเซอร์", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "แก้ไข ใหม่จากบราวเซอร์" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("ชื่อสินค้า")
    .fill("แก้ไขจากบราวเซอร์");
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(
    page.getByText("แก้ไขจากบราวเซอร์", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "โปรโมชั่น", exact: true }).click();
  await page.getByRole("button", { name: "เพิ่มโปรโมชั่น" }).click();
  await page.getByLabel("โค้ดส่วนลด").fill("BROWSER10");
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page.getByText("BROWSER10", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "ประกาศ", exact: true }).click();
  await page.getByRole("button", { name: "เพิ่มประกาศ" }).click();
  await page.getByLabel("หัวข้อประกาศ").fill("ข่าวจากการทดสอบ");
  await page.getByLabel("เนื้อหาประกาศ").fill("ประกาศสำหรับการทดสอบ");
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(
    page.getByText("ข่าวจากการทดสอบ", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "รายรับ–รายจ่าย", exact: true }).click();
  await page.getByRole("button", { name: "บันทึกรายการ", exact: true }).click();
  await page.getByLabel("หมวดหมู่").fill("ค่าใช้จ่ายทดสอบ");
  await page.getByLabel("รายละเอียด").fill("ค่าขนส่งทดสอบ");
  await page.getByLabel("จำนวนเงิน (บาท)").fill("35");
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page.getByText("ค่าขนส่งทดสอบ", { exact: true })).toBeVisible();
  await page
    .getByRole("link", { name: "สิทธิ์การใช้งาน", exact: true })
    .click();
  await page.getByRole("button", { name: "เพิ่มบทบาท" }).click();
  await page.getByLabel("ชื่อบทบาท").fill("ทีมแพ็กสินค้า");
  await page.getByLabel("จัดการสินค้า").check();
  await page.getByRole("button", { name: "ตรวจสอบสิทธิ์" }).click();
  await page
    .getByRole("button", { name: "บันทึกสิทธิ์บทบาท", exact: true })
    .click();
  await expect(page.getByText("ทีมแพ็กสินค้า", { exact: true })).toBeVisible();
  for (const [route, title] of [
    ["orders", "คำสั่งซื้อ"],
    ["members", "สมาชิก"],
    ["settings", "ตั้งค่าระบบ"],
    ["audit", "บันทึก Audit"],
  ]) {
    await page.goto("/admin/" + route);
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
  }
  await expect(
    page.getByText("ลำดับบันทึกถูกต้อง", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("shop payment QR uploads in settings and customers can enlarge/download it; bank changes invalidate it", async ({
  page,
  browser,
}) => {
  await adminLogin(page);
  await page.goto("/admin/settings");
  const initial = await (await page.request.get("/api/admin/settings")).json();
  const csrf = (await (await page.request.get("/api/me")).json()).csrf;
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4319",
  });
  try {
    await page.getByLabel("ไฟล์QR รับเงิน", { exact: true }).setInputFiles({
      name: "shop-qr.png",
      mimeType: "image/png",
      buffer: await sharp({
        create: { width: 1080, height: 1440, channels: 3, background: "white" },
      })
        .composite([
          {
            input: await QRCode.toBuffer(paymentPayload(), {
              width: 754,
              margin: 0,
            }),
            left: 163,
            top: 343,
          },
        ])
        .png()
        .toBuffer(),
    });
    await expect(page.locator(".image-uploader")).toContainText(
      "จัดเก็บ 1080 × 1440",
    );
    await page.getByRole("button", { name: "บันทึก", exact: true }).click();
    await expect(page.locator(".toast")).toContainText("บันทึกการตั้งค่าแล้ว");
    const registered = await context.request.post("/api/auth/register", {
      data: {
        firstName: "ผู้สแกน",
        lastName: "ทดสอบ",
        phone: "0812345678",
        email: "qr-" + crypto.randomUUID() + "@example.test",
        password: PASSWORD,
      },
    });
    expect(registered.status()).toBe(200);
    const customer = await context.newPage();
    await customer.goto("/wallet");
    const qr = customer.locator(".payment-qr-image");
    await expect(qr).toBeVisible();
    expect(
      await qr.evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth === 1080,
      ),
    ).toBe(true);
    const uri = await qr.getAttribute("src");
    await customer.getByRole("button", { name: "ขยายรูป QR รับเงิน" }).click();
    await expect(
      customer.getByRole("dialog", { name: "QR รับเงินของร้าน" }),
    ).toBeVisible();
    await customer.keyboard.press("Escape");
    await expect(
      customer.getByRole("button", { name: "ขยายรูป QR รับเงิน" }),
    ).toBeFocused();
    await expect(
      customer.getByRole("button", { name: "เปิด QR รูปใหญ่" }),
    ).toHaveCount(0);
    await customer.setViewportSize({ width: 1918, height: 1000 });
    const accountBox = await customer
      .locator(".bank-account-info")
      .boundingBox();
    const qrBox = await customer.locator(".payment-qr-frame").boundingBox();
    expect(qrBox!.x).toBeGreaterThan(accountBox!.x + accountBox!.width);
    expect(qrBox!.width).toBeLessThanOrEqual(180);
    expect(qrBox!.height).toBeLessThanOrEqual(180);
    const rendered = await sharp(
      await customer.locator(".payment-qr-frame").screenshot(),
    )
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(
      jsQR(
        new Uint8ClampedArray(rendered.data),
        rendered.info.width,
        rendered.info.height,
      )?.data,
    ).toBe(paymentPayload());
    let minX = rendered.info.width,
      maxX = 0;
    for (let y = 0; y < rendered.info.height; y++)
      for (let x = 0; x < rendered.info.width; x++) {
        const i = (y * rendered.info.width + x) * 4;
        if (
          rendered.data[i] < 80 &&
          rendered.data[i + 1] < 80 &&
          rendered.data[i + 2] < 80
        ) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
        }
      }
    expect(maxX - minX).toBeGreaterThan(130);
    await customer.screenshot({
      path: "output/playwright/wallet-qr-beside-account.png",
      fullPage: true,
    });
    const [download] = await Promise.all([
      customer.waitForEvent("download"),
      customer.getByRole("link", { name: "บันทึก QR", exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("shop-payment-qr.png");
    await customer.setViewportSize({ width: 390, height: 844 });
    expect(
      await customer.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await customer.screenshot({
      path: "output/playwright/wallet-payment-qr.png",
      fullPage: true,
    });
    let broken = true;
    await customer.route("**" + uri, (route) =>
      broken
        ? route.fulfill({ status: 503, body: "unavailable" })
        : route.continue(),
    );
    await customer.reload();
    await expect(customer.getByRole("alert")).toContainText(
      "โหลด QR ไม่สำเร็จ",
    );
    broken = false;
    await customer.getByRole("button", { name: "ลองอีกครั้ง" }).click();
    await expect(customer.locator(".payment-qr-image")).toBeVisible();
    await page.getByLabel("เลขบัญชีรับเงิน").fill("2222222222");
    await page.getByRole("button", { name: "บันทึก", exact: true }).click();
    await expect(page.locator(".toast")).toContainText("บัญชีเปลี่ยน");
    await customer.reload();
    await expect(customer.locator(".payment-qr")).toHaveCount(0);
  } finally {
    const response = await page.request.put("/api/admin/settings", {
      headers: { "x-csrf-token": csrf },
      data: initial,
    });
    expect(response.ok()).toBe(true);
    await context.close();
  }
});

test("customer login returns home, profile has an icon and header logout revokes the session", async ({
  page,
}) => {
  await register(page);
  const me = await (await page.request.get("/api/me")).json();
  await expect(
    page.getByRole("link", { name: "บัญชีของฉัน" }).locator("svg"),
  ).toBeVisible();
  await page.getByRole("button", { name: "ออกจากระบบ", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "เข้าสู่ระบบ", exact: true }),
  ).toBeVisible();
  expect((await (await page.request.get("/api/me")).json()).user).toBeNull();
  await page.goto("/login?next=/wallet");
  await page.getByLabel("อีเมล").fill(me.user.email);
  await page.getByLabel("รหัสผ่าน").fill(PASSWORD);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("heading", { name: "ของที่ชอบ ให้เราหิ้วมาให้" }),
  ).toBeVisible();
});

test("address book supports map pin, multiple addresses, default selection, checkout snapshot and deletion", async ({
  page,
}) => {
  // Tile images are mocked; functional tests do not crawl public map servers.
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.fulfill({ contentType: "image/png", body: png }),
  );
  await register(page);
  await page.getByRole("link", { name: "บัญชีของฉัน" }).click();
  await page.getByRole("button", { name: "เพิ่มที่อยู่", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "เพิ่มที่อยู่", exact: true });
  await dialog.getByLabel("ชื่อเรียกที่อยู่").fill("บ้าน");
  await dialog.getByLabel("เบอร์โทรศัพท์").fill("0812345678");
  await dialog
    .getByLabel("ที่อยู่และรหัสไปรษณีย์")
    .fill("123 ถนนบ้าน กรุงเทพฯ 10110");
  await dialog.getByRole("button", { name: "ปักหมุดบนแผนที่" }).click();
  const mapDialog = page.getByRole("dialog", {
    name: "ปักหมุดที่อยู่จัดส่ง",
    exact: true,
  });
  const map = mapDialog.locator(".address-map");
  await expect(map.locator(".leaflet-control-zoom")).toBeVisible();
  await map.focus();
  await map.press("ArrowRight");
  await map.press("Enter");
  await expect(mapDialog.getByRole("status")).toContainText("พิกัดที่เลือก");
  await map.click({ position: { x: 180, y: 140 } });
  await map
    .locator(".leaflet-marker-icon")
    .dragTo(map, { targetPosition: { x: 240, y: 180 } });
  await expect(map.locator(".leaflet-control-zoom")).toHaveCSS(
    "box-shadow",
    "none",
  );
  expect(
    (
      await new AxeBuilder({ page })
        .include(".address-map")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await mapDialog.screenshot({ path: "output/playwright/address-map.png" });
  await mapDialog.getByRole("button", { name: "ใช้หมุดนี้" }).click();
  await expect(dialog.getByLabel("ละติจูด")).not.toHaveValue("");
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({ latitude: 13.765, longitude: 100.51 });
  await dialog.getByRole("button", { name: "ใช้ตำแหน่งปัจจุบัน" }).click();
  await expect(dialog.getByLabel("ละติจูด")).toHaveValue("13.765");
  expect(
    (
      await new AxeBuilder({ page })
        .include("dialog[open]")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await dialog.getByRole("button", { name: "บันทึกที่อยู่" }).click();
  await expect(page.locator(".address-card")).toHaveCount(1);
  await page.getByRole("button", { name: "เพิ่มที่อยู่", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "เพิ่มที่อยู่", exact: true });
  await dialog.getByLabel("ชื่อเรียกที่อยู่").fill("ที่ทำงาน");
  await dialog.getByLabel("เบอร์โทรศัพท์").fill("0898765432");
  await dialog
    .getByLabel("ที่อยู่และรหัสไปรษณีย์")
    .fill("456 ถนนสุขุมวิท กรุงเทพฯ 10200");
  await dialog.getByRole("button", { name: "บันทึกที่อยู่" }).click();
  await expect(page.locator(".address-card")).toHaveCount(2);
  await page
    .getByRole("button", { name: "ตั้งเป็นที่อยู่หลัก", exact: true })
    .click();
  await expect(page.locator(".address-card").first()).toContainText("ที่ทำงาน");
  await page.screenshot({
    path: "output/playwright/addresses-mobile.png",
    fullPage: true,
  });
  const items = (await (await page.request.get("/api/addresses")).json()).items;
  const primary = items.find((a) => a.is_default),
    home = items.find((a) => a.label === "บ้าน");
  await page.goto("/");
  await page
    .getByRole("button", { name: "เพิ่ม สินค้าทดสอบ ลงตะกร้า" })
    .click();
  await page.getByRole("link", { name: /ตะกร้า/ }).click();
  await page.getByRole("radio").nth(1).check();
  await expect(page.getByLabel("ที่อยู่จัดส่งและรหัสไปรษณีย์")).toHaveValue(
    primary.address,
  );
  await page.getByLabel("เลือกที่อยู่ที่บันทึกไว้").selectOption(home.id);
  await expect(page.getByLabel("ละติจูด")).toHaveValue(String(home.latitude));
  await page.getByRole("button", { name: "ตรวจสอบและยืนยัน" }).click();
  await page
    .getByRole("button", { name: "ยืนยันคำสั่งซื้อ", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "คำสั่งซื้อของฉัน" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "ดูหมุดจัดส่งบนแผนที่" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "บัญชีของฉัน" }).click();
  await page
    .locator(".address-card")
    .filter({ hasText: "ที่ทำงาน" })
    .getByRole("button", { name: "ลบ", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "ลบที่อยู่นี้?", exact: true })
    .click();
  await expect(page.locator(".address-card")).toHaveCount(1);
  await expect(page.locator(".address-card")).toContainText("ที่อยู่หลัก");
});

test("social contact settings display local full-color logos and safe contact links", async ({
  page,
}) => {
  await adminLogin(page);
  await page.goto("/admin/settings");
  const initial = await (await page.request.get("/api/admin/settings")).json();
  const csrf = (await (await page.request.get("/api/me")).json()).csrf;
  try {
    for (const [label, url] of [
      ["LINE", "https://lin.ee/example"],
      ["Facebook", "https://facebook.com/example"],
      ["Telegram", "https://t.me/example"],
      ["TikTok", "https://tiktok.com/@example"],
      ["Instagram", "https://instagram.com/example"],
    ])
      await page.getByLabel(label, { exact: true }).fill(url);
    await page.getByRole("button", { name: "บันทึก", exact: true }).click();
    await expect(page.locator(".toast")).toContainText("บันทึกการตั้งค่าแล้ว");
    await page.goto("/");
    const contacts = page.getByRole("navigation", {
      name: "ช่องทางติดต่อร้าน",
    });
    await expect(contacts.getByRole("link")).toHaveCount(5);
    expect(
      await contacts
        .locator("img")
        .evaluateAll((imgs) =>
          imgs.every(
            (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
          ),
        ),
    ).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "output/playwright/contacts-mobile.png",
      fullPage: true,
    });
  } finally {
    expect(
      (
        await page.request.put("/api/admin/settings", {
          headers: { "x-csrf-token": csrf },
          data: initial,
        })
      ).ok(),
    ).toBe(true);
  }
});

test("settings save preserves masked secrets and rejects enabling AI without API key", async ({
  page,
}) => {
  await adminLogin(page);
  await page.goto("/admin/settings");
  await page.getByLabel("ใช้ AI ช่วยตอบใน LINE").check();
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("OpenAI API key");
  await page.getByLabel("ใช้ AI ช่วยตอบใน LINE").uncheck();
  await page.getByLabel("มัดจำขั้นต่ำ (%)").fill("0");
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("บันทึกการตั้งค่าแล้ว");
  await expect(page.getByLabel("EasySlip API key")).toHaveValue("");
});
test("mobile admin table, navigation, modal and all customer routes have no document overflow", async ({
  page,
}) => {
  await adminLogin(page);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of [
    "/admin",
    "/admin/products",
    "/admin/settings",
    "/wallet",
    "/orders",
    "/referrals",
    "/account",
  ]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator(".loading")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      path,
    ).toBe(true);
  }
  await page.goto("/admin/products");
  await page.getByRole("button", { name: "เพิ่มสินค้า", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({
    path: "output/playwright/product-modal-mobile.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "เพิ่มสินค้า", exact: true }),
  ).toBeFocused();
});
test("failed list request provides retry and recovers without blank page", async ({
  page,
}) => {
  await adminLogin(page);
  let failed = true;
  await page.route("**/api/admin/products?*", async (route) => {
    if (failed)
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "ทดสอบบริการขัดข้อง" }),
      });
    else await route.continue();
  });
  await page.goto("/admin/products");
  await expect(page.getByRole("alert")).toContainText("ทดสอบบริการขัดข้อง");
  failed = false;
  await page.getByRole("button", { name: "ลองอีกครั้ง", exact: true }).click();
  await expect(page.getByText("สินค้าทดสอบ", { exact: true })).toBeVisible();
});
