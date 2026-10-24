import {
  test,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const password = "Test-strong-password-2026!";
async function owner(browser: Browser) {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4319",
  });
  const res = await context.request.post("/api/auth/login", {
    data: { email: "admin@e2e.test", password },
  });
  expect(res.ok()).toBe(true);
  return { context, csrf: (await res.json()).csrf };
}
async function employee(
  browser: Browser,
  admin: { context: BrowserContext; csrf: string },
  role: string,
) {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4319",
  });
  const email = crypto.randomUUID() + "@test.example";
  const created = await context.request.post("/api/auth/register", {
    data: {
      firstName: "ทีมงาน",
      lastName: "ทดสอบ",
      phone: "0812345678",
      email,
      password,
    },
  });
  expect(created.ok()).toBe(true);
  const user = (await created.json()).user;
  const changed = await admin.context.request.put(
    "/api/admin/members/" + user.id,
    {
      headers: { "x-csrf-token": admin.csrf },
      data: { role_id: role, active: true },
    },
  );
  expect(changed.ok()).toBe(true);
  const page = await context.newPage();
  await page.goto("/login?next=/admin");
  await page.getByLabel("อีเมล").fill(email);
  await page.getByLabel("รหัสผ่าน").fill(password);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  return { context, page, user };
}
async function expectForbidden(page: Page, path: string) {
  await page.goto(path);
  await expect(
    page.getByRole("heading", {
      name: "คุณไม่มีสิทธิ์เข้าถึงหน้านี้",
      exact: true,
    }),
  ).toBeVisible();
}
test("owner sees six prepared roles, independent rights and automatic view dependencies; custom role persists and can be assigned", async ({
  browser,
}) => {
  const a = await owner(browser);
  const page = await a.context.newPage();
  try {
    await page.goto("/admin/roles");
    for (const name of [
      "เจ้าของร้าน",
      "ลูกค้า",
      "ผู้จัดการร้าน",
      "พนักงานบริการลูกค้า/จัดส่ง",
      "ฝ่ายการเงิน",
      "ฝ่ายการตลาด",
    ])
      await expect(
        page.getByRole("heading", { name, exact: true }),
      ).toBeVisible();
    await page.getByRole("button", { name: "เพิ่มบทบาท", exact: true }).click();
    const modal = page.getByRole("dialog", { name: "เพิ่มบทบาท", exact: true });
    await modal
      .getByLabel("ชื่อบทบาท")
      .fill("ดูและจัดส่ง " + crypto.randomUUID().slice(0, 6));
    await modal.getByLabel("อัปเดตสถานะและเลขพัสดุ", { exact: true }).check();
    await expect(
      modal.getByLabel("ดูคำสั่งซื้อและข้อมูลจัดส่ง", { exact: true }),
    ).toBeChecked();
    await expect(
      modal.getByLabel("ยกเลิกออร์เดอร์และคืนเงินที่จ่ายจริง", { exact: true }),
    ).not.toBeChecked();
    await modal
      .getByLabel("ดูคำสั่งซื้อและข้อมูลจัดส่ง", { exact: true })
      .uncheck();
    await expect(
      modal.getByLabel("อัปเดตสถานะและเลขพัสดุ", { exact: true }),
    ).not.toBeChecked();
    await modal.getByLabel("อัปเดตสถานะและเลขพัสดุ", { exact: true }).check();
    await expect(
      modal.getByLabel("แก้ไขข้อมูลลูกค้า", { exact: true }),
    ).not.toBeChecked();
    await expect(
      modal.getByLabel("รีเซ็ตรหัสผ่านลูกค้า", { exact: true }),
    ).not.toBeChecked();
    expect(await modal.locator('input[value="settings"]').count()).toBe(0);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(scan.violations).toEqual([]);
    const name = await modal.getByLabel("ชื่อบทบาท").inputValue();
    await modal
      .getByRole("button", { name: "ตรวจสอบสิทธิ์", exact: true })
      .click();
    await page
      .getByRole("button", { name: "บันทึกสิทธิ์บทบาท", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    const role = (
      await (await a.context.request.get("/api/admin/roles")).json()
    ).roles.find((r: any) => r.name === name);
    const s = await employee(browser, a, role.id);
    await expect(
      s.page.getByRole("heading", { name: "คำสั่งซื้อ", exact: true }),
    ).toBeVisible();
    expect((await s.context.request.get("/api/admin/settings")).status()).toBe(
      403,
    );
    await s.context.close();
    await page.screenshot({
      path: "output/playwright/roles-mobile.png",
      fullPage: true,
    });
  } finally {
    await a.context.close();
  }
});
test("marketing branding, banners and campaigns work without bank, API or commission controls; finance remains isolated", async ({
  browser,
}) => {
  const a = await owner(browser),
    m = await employee(browser, a, "marketing"),
    f = await employee(browser, a, "accountant");
  try {
    await expect(
      m.page.getByRole("heading", { name: "โปรโมชั่น", exact: true }),
    ).toBeVisible();
    await expect(
      m.page.getByRole("link", { name: "ตั้งค่าระบบ", exact: true }),
    ).toHaveCount(0);
    await expect(
      m.page.getByRole("link", { name: "รายรับ–รายจ่าย", exact: true }),
    ).toHaveCount(0);
    await m.page
      .getByRole("link", { name: "สีและภาพลักษณ์", exact: true })
      .click();
    await expect(
      m.page.getByLabel("ค่าคอมมิชชั่นแนะนำเพื่อน (% ต่อบิล)", { exact: true }),
    ).toHaveCount(0);
    await m.page.getByLabel("ระยะเวลาเปลี่ยนสไลด์ (วินาที)").fill("5");
    await m.page.getByRole("button", { name: "บันทึก", exact: true }).click();
    await expect(
      m.page.getByText("บันทึกสีและภาพลักษณ์ร้านแล้ว", { exact: true }),
    ).toBeVisible();
    await m.page.getByRole("link", { name: "แบนเนอร์", exact: true }).click();
    await expect(
      m.page.getByRole("heading", { name: "แบนเนอร์หน้าร้าน", exact: true }),
    ).toBeVisible();
    await expectForbidden(m.page, "/admin/settings");
    await expect(
      f.page.getByRole("heading", { name: "รายรับ–รายจ่าย", exact: true }),
    ).toBeVisible();
    await expect(
      f.page.getByRole("link", { name: "ส่งออก CSV", exact: true }),
    ).toBeVisible();
    await expect(
      f.page.getByRole("button", { name: "บันทึกรายการ", exact: true }),
    ).toBeVisible();
    await expect(
      f.page.getByRole("link", { name: "คำสั่งซื้อ", exact: true }),
    ).toHaveCount(0);
    await expectForbidden(f.page, "/admin/members");
  } finally {
    await m.context.close();
    await f.context.close();
    await a.context.close();
  }
});
test("shipping staff can advance orders but cannot see refund controls; a read-only role cannot write or export finance", async ({
  browser,
}) => {
  const a = await owner(browser);
  const customer = await browser.newContext({
    baseURL: "http://127.0.0.1:4319",
  });
  let s: { context: BrowserContext; page: Page } | undefined,
    reader: { context: BrowserContext; page: Page } | undefined;
  try {
    const reg = await customer.request.post("/api/auth/register", {
      data: {
        firstName: "ลูกค้าแพ็ก",
        lastName: "ทดสอบ",
        phone: "0812345678",
        email: crypto.randomUUID() + "@test.example",
        password,
      },
    });
    const user = await reg.json();
    const products = await (await customer.request.get("/api/products")).json();
    const product = products.items[0];
    const code = "SHIP" + crypto.randomUUID().replaceAll("-", "").slice(0, 12);
    const promotion = await a.context.request.post("/api/admin/promotions", {
      headers: { "x-csrf-token": a.csrf },
      data: {
        code,
        type: "percent",
        value: 100,
        minimum: 0,
        limit_count: 1,
        per_user: 1,
        starts_at: "2020-01-01T00:00:00.000Z",
        ends_at: "2099-01-01T00:00:00.000Z",
        active: true,
      },
    });
    expect(promotion.ok()).toBe(true);
    const payload = {
      items: [{ productId: product.id, quantity: 1 }],
      payment: "full",
      coupon: code,
      shipping: {
        name: "ผู้รับ",
        phone: "0812345678",
        address: "123 ถนนทดสอบ กรุงเทพ 10110",
      },
    };
    const quote = await (
      await customer.request.post("/api/orders/quote", {
        headers: { "x-csrf-token": user.csrf },
        data: payload,
      })
    ).json();
    const order = await customer.request.post("/api/orders", {
      headers: {
        "x-csrf-token": user.csrf,
        "Idempotency-Key": crypto.randomUUID(),
      },
      data: { ...payload, expectedQuote: quote.fingerprint },
    });
    expect(order.ok()).toBe(true);
    const oid = (await order.json()).id;
    s = await employee(browser, a, "support");
    await expect(
      s.page.getByRole("heading", { name: "คำสั่งซื้อ", exact: true }),
    ).toBeVisible();
    await s.page
      .getByRole("row")
      .filter({ hasText: oid.slice(0, 8).toUpperCase() })
      .getByRole("button", { name: "ดูรายละเอียด" })
      .click();
    await expect(s.page.getByRole("dialog")).toBeVisible();
    await expect(
      s.page.getByRole("button", { name: "อัปเดตสถานะ", exact: true }),
    ).toBeVisible();
    await expect(
      s.page.getByRole("button", { name: "ยกเลิกและคืนเงิน", exact: true }),
    ).toHaveCount(0);
    await s.page
      .getByRole("button", { name: "อัปเดตสถานะ", exact: true })
      .click();
    await expect(s.page.getByRole("dialog")).toHaveCount(0);
    await expect(
      s.page
        .getByRole("row")
        .filter({ hasText: oid.slice(0, 8).toUpperCase() }),
    ).toContainText("กำลังเตรียมสินค้า");
    expect((await s.context.request.get("/api/admin/finance")).status()).toBe(
      403,
    );
    const r = await a.context.request.post("/api/admin/roles", {
      headers: { "x-csrf-token": a.csrf },
      data: {
        name: "ดูบัญชี " + crypto.randomUUID(),
        permissions: ["finance"],
      },
    });
    expect(r.ok()).toBe(true);
    reader = await employee(browser, a, (await r.json()).id);
    await expect(
      reader.page.getByRole("heading", { name: "รายรับ–รายจ่าย", exact: true }),
    ).toBeVisible();
    await expect(
      reader.page.getByRole("link", { name: "ส่งออก CSV", exact: true }),
    ).toHaveCount(0);
    await expect(
      reader.page.getByRole("button", { name: "บันทึกรายการ", exact: true }),
    ).toHaveCount(0);
  } finally {
    await s?.context.close();
    await reader?.context.close();
    await customer.close();
    await a.context.close();
  }
});
