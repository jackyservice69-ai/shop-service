import {
  test,
  expect,
  type Browser,
  type BrowserContext,
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
  const auth = await res.json();
  return { context, csrf: auth.csrf, user: auth.user };
}
async function customer(browser: Browser) {
  const context = await browser.newContext({
      baseURL: "http://127.0.0.1:4319",
    }),
    email = crypto.randomUUID() + "@test.example";
  const res = await context.request.post("/api/auth/register", {
    data: {
      firstName: "ลูกค้าเติมเงิน",
      lastName: "ทดสอบ",
      phone: "0812345678",
      email,
      password,
    },
  });
  expect(res.ok()).toBe(true);
  return { context, email, ...(await res.json()) };
}
test("owner credits the selected customer after confirmation/password; customer balance and attributed transaction agree without exposing internal notes", async ({
  browser,
}) => {
  const a = await owner(browser),
    c = await customer(browser),
    page = await a.context.newPage();
  try {
    await page.goto("/admin/wallet");
    await page
      .getByRole("button", { name: "เติมเงินให้ลูกค้า", exact: true })
      .click();
    let modal = page.getByRole("dialog", {
      name: "เติมเงินให้ลูกค้า",
      exact: true,
    });
    await modal
      .getByPlaceholder("ค้นหาชื่อหรืออีเมลลูกค้าอย่างน้อย 2 ตัวอักษร…")
      .fill(c.email);
    await modal
      .locator(".wallet-customer-choice")
      .filter({ hasText: c.email })
      .click();
    await modal.getByLabel("จำนวนเงินที่เติม (บาท)").fill("125.50");
    await modal.getByLabel("ที่มาของยอดเติม").selectOption("cash");
    const reference = "CASH-" + crypto.randomUUID();
    await modal.getByLabel("เลขที่เอกสารอ้างอิง").fill(reference);
    await modal
      .getByLabel("เหตุผลการเติมเงิน")
      .fill("รับเงินสดที่หน้าร้าน ทดสอบ");
    await modal
      .getByRole("button", { name: "ตรวจสอบรายการเติมเงิน", exact: true })
      .click();
    modal = page.getByRole("dialog", {
      name: "ยืนยันเติมเงินให้ลูกค้า",
      exact: true,
    });
    await expect(modal).toContainText(c.email);
    await expect(modal).toContainText("125.5");
    await modal.getByLabel("รหัสผ่านผู้ดำเนินการ").fill("wrong");
    await modal
      .getByRole("button", { name: "ยืนยันเติมเงิน", exact: true })
      .click();
    await expect(modal.getByRole("alert")).toContainText(
      "รหัสผ่านผู้ดำเนินการไม่ถูกต้อง",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const scan = await new AxeBuilder({ page })
      .include("dialog[open]")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(scan.violations).toEqual([]);
    await modal.getByLabel("รหัสผ่านผู้ดำเนินการ").fill(password);
    await modal
      .getByRole("button", { name: "ยืนยันเติมเงิน", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "เติมเงินสำเร็จ", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "ปิดหน้าต่าง", exact: true })
      .last()
      .click();
    await page
      .getByPlaceholder("ค้นหาลูกค้า อีเมล เลขอ้างอิง หรือผู้ดำเนินการ…")
      .fill(reference);
    const row = page.getByRole("row").filter({ hasText: c.email });
    await expect(row).toContainText("เติมเงินโดยผู้ดูแล");
    await row
      .getByRole("button", { name: "ดูรายละเอียด", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText(
      "รับเงินสดที่หน้าร้าน ทดสอบ",
    );
    await page
      .getByRole("dialog")
      .screenshot({ path: "output/playwright/manual-topup-detail-mobile.png" });
    const history = await (
      await a.context.request.get(
        "/api/admin/wallet/transactions?q=" + reference,
      )
    ).json();
    expect(history.items).toHaveLength(1);
    expect(history.items[0].actor_id).toBe(a.user.id);
    expect(history.items[0].amount).toBe(12550);
    expect(history.items[0].balance_after).toBe(12550);
    const cp = await c.context.newPage();
    await cp.goto("/wallet");
    await expect(
      cp.getByText("เติมเงินโดยผู้ดูแล", { exact: true }),
    ).toBeVisible();
    const own = await (await c.context.request.get("/api/wallet")).json();
    expect(JSON.stringify(own)).not.toContain("รับเงินสดที่หน้าร้าน ทดสอบ");
    expect(
      (await (await c.context.request.get("/api/me")).json()).user.balance,
    ).toBe(12550);
  } finally {
    await a.context.close();
    await c.context.close();
  }
});
test("finance can view transactions; owner explicitly grants topup right and changing the role revokes the old session", async ({
  browser,
}) => {
  const a = await owner(browser),
    s = await customer(browser),
    page = await s.context.newPage(),
    op = await a.context.newPage();
  const original = (
    await (await a.context.request.get("/api/admin/roles")).json()
  ).roles.find((r: any) => r.id === "accountant");
  try {
    const assigned = await a.context.request.put(
      "/api/admin/members/" + s.user.id,
      {
        headers: { "x-csrf-token": a.csrf },
        data: { role_id: "accountant", active: true },
      },
    );
    expect(assigned.ok()).toBe(true);
    await s.context.request.post("/api/auth/login", {
      data: { email: s.email, password },
    });
    await page.goto("/admin/wallet");
    await expect(
      page.getByRole("heading", { name: "ธุรกรรมกระเป๋าเงิน", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "เติมเงินให้ลูกค้า", exact: true }),
    ).toHaveCount(0);
    await op.goto("/admin/roles");
    await op
      .locator("section.panel")
      .filter({
        has: op.getByRole("heading", { name: "ฝ่ายการเงิน", exact: true }),
      })
      .getByRole("button", { name: "แก้ไขสิทธิ์", exact: true })
      .click();
    await op
      .getByRole("dialog")
      .getByLabel("เติมเงินกระเป๋าลูกค้าจากหลังบ้าน", { exact: true })
      .check();
    await op
      .getByRole("button", { name: "ตรวจสอบสิทธิ์", exact: true })
      .click();
    await op
      .getByRole("button", { name: "บันทึกสิทธิ์บทบาท", exact: true })
      .click();
    expect(
      (await (await s.context.request.get("/api/me")).json()).user,
    ).toBeNull();
    await s.context.request.post("/api/auth/login", {
      data: { email: s.email, password },
    });
    await page.reload();
    await expect(
      page.getByRole("button", { name: "เติมเงินให้ลูกค้า", exact: true }),
    ).toBeVisible();
  } finally {
    await a.context.request.put("/api/admin/roles/accountant", {
      headers: { "x-csrf-token": a.csrf },
      data: { name: original.name, permissions: original.permissions },
    });
    await a.context.close();
    await s.context.close();
  }
});
test("customer finds address/map page, pins current location and saves it; denied geolocation still allows a manual map pin", async ({
  browser,
}) => {
  const c = await customer(browser),
    page = await c.context.newPage();
  try {
    await c.context.grantPermissions(["geolocation"]);
    await c.context.setGeolocation({ latitude: 13.765, longitude: 100.51 });
    await page.route("https://tile.openstreetmap.org/**", (route) =>
      route.fulfill({
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl5kAAAAASUVORK5CYII=",
          "base64",
        ),
      }),
    );
    await page.goto("/account");
    await page
      .getByRole("link", { name: "ที่อยู่จัดส่ง", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "ที่อยู่และแผนที่", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "เพิ่มที่อยู่", exact: true })
      .click();
    let form = page.getByRole("dialog", { name: "เพิ่มที่อยู่", exact: true });
    await form.getByLabel("ชื่อเรียกที่อยู่").fill("บ้านพร้อมหมุด");
    await form
      .getByLabel("ที่อยู่และรหัสไปรษณีย์")
      .fill("123 ถนนสุขุมวิท กรุงเทพฯ 10110");
    await form
      .getByRole("button", { name: "ปักหมุดบนแผนที่", exact: true })
      .click();
    let map = page.getByRole("dialog", {
      name: "ปักหมุดที่อยู่จัดส่ง",
      exact: true,
    });
    await map
      .getByRole("button", { name: "ใช้ตำแหน่งปัจจุบัน", exact: true })
      .click();
    await expect(map.getByRole("status")).toContainText("13.765, 100.51");
    await map.getByRole("button", { name: "ใช้หมุดนี้", exact: true }).click();
    await expect(form.getByLabel("ละติจูด")).toHaveValue("13.765");
    await form
      .getByRole("button", { name: "บันทึกที่อยู่", exact: true })
      .click();
    await page.reload();
    const saved = (
      await (await c.context.request.get("/api/addresses")).json()
    ).items.find((a: any) => a.label === "บ้านพร้อมหมุด");
    expect(saved.latitude).toBe(13.765);
    expect(saved.longitude).toBe(100.51);
    expect(saved.is_default).toBe(1);
    await page.getByRole("button", { name: "แก้ไข", exact: true }).click();
    form = page.getByRole("dialog", { name: "แก้ไขที่อยู่", exact: true });
    await form
      .getByRole("button", { name: "แก้ไขหมุดบนแผนที่", exact: true })
      .click();
    map = page.getByRole("dialog", {
      name: "ปักหมุดที่อยู่จัดส่ง",
      exact: true,
    });
    await page.evaluate(() => {
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: {
          getCurrentPosition: (_success: any, error: any) => error({ code: 1 }),
        },
      });
    });
    await map
      .getByRole("button", { name: "ใช้ตำแหน่งปัจจุบัน", exact: true })
      .click();
    await expect(map.getByRole("alert")).toContainText(
      "ไม่อนุญาตให้ใช้ตำแหน่ง",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await map
      .getByRole("button", { name: "ปักหมุดตรงกลางแผนที่", exact: true })
      .click();
    await expect(map.getByRole("alert")).toHaveCount(0);
    const scan = await new AxeBuilder({ page })
      .include("dialog[open]")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(scan.violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await map.screenshot({
      path: "output/playwright/customer-map-location-mobile.png",
    });
    await map.getByRole("button", { name: "ใช้หมุดนี้", exact: true }).click();
    await form
      .getByRole("button", { name: "บันทึกที่อยู่", exact: true })
      .click();
  } finally {
    await c.context.close();
  }
});
