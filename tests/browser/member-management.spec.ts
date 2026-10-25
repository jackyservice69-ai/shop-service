import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const adminPassword = "Test-strong-password-2026!";
test("admin edits a customer and resets password; secret is masked, old sessions revoked and customer must choose a private password", async ({
  browser,
  page,
}) => {
  const customer = await browser.newContext({
      baseURL: "http://127.0.0.1:4319",
    }),
    customerPage = await customer.newPage();
  const email = crypto.randomUUID() + "@test.example",
    newEmail = crypto.randomUUID() + "@test.example";
  try {
    const created = await customer.request.post("/api/auth/register", {
      data: {
        firstName: "ลูกค้าจัดการ",
        lastName: "ทดสอบ",
        phone: "0812345678",
        email,
        password: adminPassword,
      },
    });
    expect(created.ok()).toBe(true);
    await page.goto("/login?next=/admin/members");
    await page.getByLabel("อีเมล").fill("admin@e2e.test");
    await page.getByLabel("รหัสผ่าน").fill(adminPassword);
    await page
      .getByRole("button", { name: "เข้าสู่ระบบ", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "สมาชิก", exact: true }),
    ).toBeVisible();
    await page
      .getByPlaceholder("ค้นหาชื่อ อีเมล เบอร์โทร หรือ LINE ID…")
      .fill("ลูกค้าจัดการ");
    await page
      .getByRole("row")
      .filter({ hasText: email })
      .getByRole("button", { name: "แก้ไขข้อมูล", exact: true })
      .click();
    let modal = page.getByRole("dialog", {
      name: "แก้ไขข้อมูลลูกค้า",
      exact: true,
    });
    await modal.getByLabel("ชื่อหน้า").fill("ลูกค้าจัดการใหม่");
    await modal.getByLabel("นามสกุล").fill("แก้ไขแล้ว");
    await modal.getByLabel("อีเมลลูกค้า").fill(newEmail);
    await modal.getByLabel("เบอร์โทร").fill("089-123-4567");
    await modal.getByLabel("รู้จักเราจากที่ไหน").fill("Instagram");
    await modal.getByLabel("Line ID Add").fill("@editedcustomer");
    await modal.getByLabel("รหัสผ่านผู้ดำเนินการ").fill("wrong");
    await modal
      .getByRole("button", { name: "บันทึกข้อมูลลูกค้า", exact: true })
      .click();
    await expect(
      modal.getByText("รหัสผ่านผู้ดำเนินการไม่ถูกต้อง", { exact: true }),
    ).toBeVisible();
    await modal.getByLabel("รหัสผ่านผู้ดำเนินการ").fill(adminPassword);
    await modal
      .getByRole("button", { name: "บันทึกข้อมูลลูกค้า", exact: true })
      .click();
    await expect(modal).toHaveCount(0);
    const row = page.getByRole("row").filter({ hasText: newEmail });
    await expect(row).toContainText("0891234567");
    await expect(row).toContainText("Instagram");
    expect((await customer.request.get("/api/me")).ok()).toBe(true);
    expect(
      (await (await customer.request.get("/api/me")).json()).user,
    ).toBeNull();
    expect(
      (
        await customer.request.post("/api/auth/login", {
          data: { email: newEmail, password: adminPassword },
        })
      ).ok(),
    ).toBe(true);
    await row
      .getByRole("button", { name: "รีเซ็ตรหัสผ่าน", exact: true })
      .click();
    modal = page.getByRole("dialog", {
      name: "รีเซ็ตรหัสผ่านลูกค้า",
      exact: true,
    });
    await modal.getByLabel("รหัสผ่านผู้ดำเนินการ").fill(adminPassword);
    await modal
      .getByRole("button", { name: "ยืนยันรีเซ็ตรหัสผ่าน", exact: true })
      .click();
    const secret = modal.getByLabel("รหัสผ่านชั่วคราว", { exact: true });
    await expect(secret).toHaveAttribute("type", "password");
    const temporary = await secret.inputValue();
    expect(temporary).toHaveLength(24);
    await modal
      .getByRole("button", { name: "แสดงรหัสผ่านชั่วคราว", exact: true })
      .click();
    await expect(secret).toHaveAttribute("type", "text");
    await modal
      .getByRole("button", { name: "ซ่อนรหัสผ่านชั่วคราว", exact: true })
      .click();
    await expect(secret).toHaveAttribute("type", "password");
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await modal
      .getByRole("button", { name: "คัดลอกรหัสผ่าน", exact: true })
      .click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      temporary,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(await modal.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: "output/playwright/customer-reset-mobile.png",
    });
    await modal.getByText("ปิดหน้าต่าง", { exact: true }).click();
    expect((await customer.request.get("/api/wallet")).status()).toBe(401);
    await customerPage.goto("/login");
    await customerPage.getByLabel("อีเมล").fill(newEmail);
    await customerPage.getByLabel("รหัสผ่าน", { exact: false }).fill(temporary);
    await customerPage
      .getByRole("button", { name: "เข้าสู่ระบบ", exact: true })
      .click();
    await expect(
      customerPage.getByRole("heading", {
        name: "ตั้งรหัสผ่านใหม่ก่อนใช้งาน",
        exact: true,
      }),
    ).toBeVisible();
    expect((await customer.request.get("/api/wallet")).status()).toBe(403);
    await customerPage.goto("/wallet");
    await expect(customerPage).toHaveURL(/\/account$/);
    await customerPage.getByLabel("รหัสผ่านชั่วคราว").fill(temporary);
    const privatePassword = "Priv8!xx";
    await expect(
      customerPage.locator('input[name="password"]'),
    ).toHaveAttribute("minlength", "8");
    await expect(customerPage.getByLabel("ยืนยันรหัสผ่านใหม่")).toHaveAttribute(
      "minlength",
      "8",
    );
    await customerPage.locator('input[name="password"]').fill(privatePassword);
    await customerPage
      .getByLabel("ยืนยันรหัสผ่านใหม่")
      .fill("Different-password-2026!");
    await customerPage
      .getByRole("button", { name: "เปลี่ยนรหัสผ่าน", exact: true })
      .click();
    await expect(
      customerPage.getByText("ยืนยันรหัสผ่านใหม่ไม่ตรงกัน", { exact: true }),
    ).toBeVisible();
    await customerPage.getByLabel("ยืนยันรหัสผ่านใหม่").fill(privatePassword);
    const scan = await new AxeBuilder({ page: customerPage })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      scan.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
    await customerPage
      .getByRole("button", { name: "เปลี่ยนรหัสผ่าน", exact: true })
      .click();
    await expect(customerPage).toHaveURL(/\/login/);
    await customerPage.getByLabel("อีเมล").fill(newEmail);
    await customerPage.getByLabel("รหัสผ่าน").fill(privatePassword);
    await customerPage
      .getByRole("button", { name: "เข้าสู่ระบบ", exact: true })
      .click();
    await expect(customerPage).toHaveURL("/");
    await customerPage.goto("/wallet");
    await expect(
      customerPage.getByRole("heading", { name: "กระเป๋าเงิน", exact: true }),
    ).toBeVisible();
    const me = await (await customer.request.get("/api/me")).json();
    expect(me.user.mustChangePassword).toBe(false);
    expect(me.user.name).toBe("ลูกค้าจัดการใหม่ แก้ไขแล้ว");
  } finally {
    await customer.close();
  }
});
