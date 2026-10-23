import { test, expect, type Page } from "@playwright/test";

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
  await page.getByLabel("ชื่อ–นามสกุล").fill("ลูกค้าทดสอบ");
  await page
    .getByLabel("อีเมล")
    .fill("browser-" + crypto.randomUUID() + "@example.test");
  await page.getByLabel("รหัสผ่าน").fill(PASSWORD);
  await page.getByRole("button", { name: "สร้างบัญชี", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "ของที่ชอบ ให้เราหิ้วมาให้" }),
  ).toBeVisible();
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
