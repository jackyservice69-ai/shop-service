import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("owner configures fees per shop, preserves zero and draft values, resets to the current default, and sellers see their own effective rate", async ({
  page,
  browser,
  baseURL,
}) => {
  const contexts = [];
  const prefix = "ร้านอัตรา " + crypto.randomUUID().slice(0, 6);
  const login = await page.request.post("/api/auth/login", {
    data: { email: "admin@e2e.test", password: "Test-strong-password-2026!" },
  });
  expect(login.ok()).toBe(true);
  const initial = await (
    await page.request.get("/api/admin/consignment-settings")
  ).json();
  const csrf = (await (await page.request.get("/api/me")).json()).csrf;
  try {
    for (const suffix of ["A", "B", "C"]) {
      const context = await browser.newContext({ baseURL });
      contexts.push(context);
      const registration = await context.request.post("/api/auth/register", {
        data: {
          firstName: "ตัวแทนอัตรา" + suffix,
          lastName: "ทดสอบ",
          phone: "0812345678",
          email: crypto.randomUUID() + "@fees.test",
          password: "Test-strong-password-2026!",
        },
      });
      expect(registration.ok()).toBe(true);
      const member = await registration.json();
      expect(
        (
          await context.request.post("/api/consignment/apply", {
            headers: { "x-csrf-token": member.csrf },
            data: { shopName: prefix + suffix, acceptTerms: true },
          })
        ).ok(),
      ).toBe(true);
    }
    await page.goto("/admin/consignments");
    await page.getByLabel("ค่าฝากขาย (%)").fill("12");
    await page
      .getByRole("button", { name: "บันทึกค่าฝากขาย", exact: true })
      .click();
    const row = (suffix: string) =>
      page.getByRole("row").filter({ hasText: prefix + suffix });
    await expect(row("C").locator(".consignment-fee-cell")).toContainText(
      "12%",
    );
    for (const [suffix, rate] of [
      ["A", "7.25"],
      ["B", "0"],
    ]) {
      await row(suffix).getByRole("button").click();
      const dialog = page.getByRole("dialog", {
        name: "จัดการสมาชิกตัวแทน",
        exact: true,
      });
      await dialog
        .getByRole("checkbox", {
          name: "กำหนดค่าฝากขายเฉพาะร้านนี้",
          exact: true,
        })
        .check();
      if (suffix === "A") {
        await dialog.getByLabel("ค่าฝากขาย (%)").fill("");
        await dialog
          .getByRole("button", { name: "ยืนยันสถานะตัวแทน", exact: true })
          .click();
        await expect(dialog.getByRole("alert")).toContainText(
          "กรุณาตรวจสอบข้อมูลที่ระบุ",
        );
      }
      await dialog.getByLabel("ค่าฝากขาย (%)").fill(rate);
      await dialog
        .getByRole("button", { name: "ยืนยันสถานะตัวแทน", exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      await expect(row(suffix).locator(".consignment-fee-cell")).toContainText(
        rate + "%",
      );
      await expect(row(suffix).locator(".consignment-fee-cell")).toContainText(
        "เฉพาะร้าน",
      );
    }
    await page.getByLabel("ค่าฝากขาย (%)").fill("20");
    await page
      .getByRole("button", { name: "บันทึกค่าฝากขาย", exact: true })
      .click();
    await expect(row("C").locator(".consignment-fee-cell")).toContainText(
      "20%",
    );
    await expect(row("A").locator(".consignment-fee-cell")).toContainText(
      "7.25%",
    );
    await expect(row("B").locator(".consignment-fee-cell")).toContainText("0%");
    await row("A").getByRole("button").click();
    const dialog = page.getByRole("dialog", {
        name: "จัดการสมาชิกตัวแทน",
        exact: true,
      }),
      override = dialog.getByRole("checkbox", {
        name: "กำหนดค่าฝากขายเฉพาะร้านนี้",
        exact: true,
      });
    await expect(override).toBeChecked();
    await expect(dialog.getByLabel("ค่าฝากขาย (%)")).toHaveValue("7.25");
    await override.uncheck();
    await expect(dialog).toContainText("ใช้อัตรากลาง 20%");
    await override.check();
    await expect(dialog.getByLabel("ค่าฝากขาย (%)")).toHaveValue("7.25");
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const scan = await new AxeBuilder({ page })
        .include("dialog")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(scan.violations.map((v) => v.id)).toEqual([]);
      await page.screenshot({
        path: `output/playwright/consignor-shop-fee-${width}.png`,
      });
    }
    await override.uncheck();
    await dialog
      .getByRole("button", { name: "ยืนยันสถานะตัวแทน", exact: true })
      .click();
    await expect(row("A").locator(".consignment-fee-cell")).toContainText(
      "20%",
    );
    await expect(row("A").locator(".consignment-fee-cell")).toContainText(
      "ใช้อัตรากลาง",
    );
    const sellerA = await contexts[0].newPage(),
      sellerB = await contexts[1].newPage();
    await sellerA.goto("/consignment");
    await sellerB.goto("/consignment");
    await expect(sellerA.getByText(/ค่าฝากขายปัจจุบัน/)).toContainText("20%");
    await expect(sellerA.getByText(/ค่าฝากขายปัจจุบัน/)).toContainText(
      "ใช้อัตรากลาง",
    );
    await expect(sellerB.getByText(/ค่าฝากขายปัจจุบัน/)).toContainText("0%");
    await expect(sellerB.getByText(/ค่าฝากขายปัจจุบัน/)).toContainText(
      "อัตราเฉพาะร้าน",
    );
    await expect(
      sellerB.getByRole("checkbox", {
        name: "กำหนดค่าฝากขายเฉพาะร้านนี้",
        exact: true,
      }),
    ).toHaveCount(0);
  } finally {
    expect(
      (
        await page.request.put("/api/admin/consignment-settings", {
          headers: { "x-csrf-token": csrf },
          data: initial,
        })
      ).ok(),
    ).toBe(true);
    await Promise.all(contexts.map((c) => c.close()));
  }
});
