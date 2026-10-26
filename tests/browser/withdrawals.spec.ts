import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";

test("settled seller earnings can be requested, approved, paid, rejected and cancelled on mobile and desktop", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(90000);
  const contexts = [],
    prefix = "ถอนทดสอบ " + crypto.randomUUID().slice(0, 6),
    password = "Test-strong-password-2026!";
  const adminLogin = await page.request.post("/api/auth/login", {
    data: { email: "admin@e2e.test", password },
  });
  expect(adminLogin.ok()).toBe(true);
  const acsrf = (await (await page.request.get("/api/me")).json()).csrf;
  async function member(suffix: string) {
    const context = await browser.newContext({ baseURL });
    contexts.push(context);
    const response = await context.request.post("/api/auth/register", {
      data: {
        firstName: "ตัวแทน",
        lastName: suffix,
        phone: "0812345678",
        email: crypto.randomUUID() + "@withdraw.test",
        password,
      },
    });
    expect(response.ok()).toBe(true);
    return { context, ...(await response.json()) };
  }
  async function ownerPut(url: string, data: any) {
    const r = await page.request.put(url, {
      headers: { "x-csrf-token": acsrf },
      data,
    });
    expect(r.ok(), await r.text()).toBe(true);
  }
  try {
    const seller = await member("ผู้ขาย"),
      buyer = await member("ผู้ซื้อ");
    expect(
      (
        await seller.context.request.post("/api/consignment/apply", {
          headers: { "x-csrf-token": seller.csrf },
          data: { shopName: prefix, acceptTerms: true },
        })
      ).ok(),
    ).toBe(true);
    await ownerPut("/api/admin/consignments/" + seller.user.id, {
      status: "approved",
      note: "",
      version: 1,
      feePercent: 0,
    });
    const bytes = await sharp({
      create: { width: 80, height: 80, channels: 3, background: "#f6c2c2" },
    })
      .png()
      .toBuffer();
    const media = await seller.context.request.post("/api/consignment/media", {
      headers: { "x-csrf-token": seller.csrf },
      multipart: {
        image: { name: "product.png", mimeType: "image/png", buffer: bytes },
      },
    });
    expect(media.ok()).toBe(true);
    const image = (await media.json()).url;
    expect(
      (
        await seller.context.request.post("/api/consignment/products", {
          headers: { "x-csrf-token": seller.csrf },
          data: {
            name: prefix,
            description: "สินค้าทดสอบถอนรายได้",
            category: "กระเป๋า",
            price: 10000,
            stock: 1,
            image,
            images: [image],
          },
        })
      ).ok(),
    ).toBe(true);
    const product = (
      await (
        await seller.context.request.get("/api/consignment/products")
      ).json()
    ).items[0];
    await ownerPut("/api/admin/consignment-products/" + product.id, {
      approved: true,
      version: product.version,
    });
    expect(
      (
        await page.request.post("/api/admin/wallet/topups", {
          headers: {
            "x-csrf-token": acsrf,
            "Idempotency-Key": crypto.randomUUID(),
          },
          data: {
            userId: buyer.user.id,
            amount: 10000,
            expectedBalance: 0,
            source: "cash",
            reference: "WITHDRAW-" + crypto.randomUUID(),
            reason: "ยอดจำลองสำหรับทดสอบถอน",
            actorPassword: password,
          },
        })
      ).ok(),
    ).toBe(true);
    const orderInput = {
      items: [{ productId: product.id, quantity: 1 }],
      coupon: "",
      payment: "full",
      shipping: {
        name: "ผู้ซื้อทดสอบ",
        phone: "0812345678",
        address: "123 ถนนทดสอบ กรุงเทพฯ 10110",
      },
    };
    const quote = await buyer.context.request.post("/api/orders/quote", {
      headers: { "x-csrf-token": buyer.csrf },
      data: orderInput,
    });
    expect(quote.ok()).toBe(true);
    const orderResponse = await buyer.context.request.post("/api/orders", {
      headers: {
        "x-csrf-token": buyer.csrf,
        "Idempotency-Key": crypto.randomUUID(),
      },
      data: { ...orderInput, expectedQuote: (await quote.json()).fingerprint },
    });
    expect(orderResponse.ok(), await orderResponse.text()).toBe(true);
    const order = await orderResponse.json();
    expect(
      (
        await (
          await seller.context.request.get("/api/consignment/withdrawals")
        ).json()
      ).available,
    ).toBe(0);
    for (const status of ["processing", "shipped", "completed"])
      await ownerPut("/api/admin/orders/" + order.id, {
        status,
        tracking: "TEST-WITHDRAW",
      });
    expect(
      (
        await (
          await seller.context.request.get("/api/consignment/withdrawals")
        ).json()
      ).available,
    ).toBe(10000);
    const sellerPage = await seller.context.newPage();
    await sellerPage.goto("/consignment");
    const panel = sellerPage.locator(".withdrawal-panel");
    await expect(panel.getByText("฿100", { exact: true })).toBeVisible();
    await panel
      .getByRole("button", { name: "แจ้งถอนเงิน", exact: true })
      .click();
    let dialog = sellerPage.getByRole("dialog", {
      name: "แจ้งถอนรายได้ฝากขาย",
      exact: true,
    });
    await dialog.getByLabel("ยอดถอน (บาท)").fill("60");
    await dialog.getByLabel("ธนาคารรับเงิน").selectOption("014");
    await dialog.getByLabel("เลขบัญชีรับเงิน").fill("1234567890");
    await dialog.getByLabel("ชื่อบัญชีรับเงิน").fill("ตัวแทน ทดสอบ");
    await dialog.getByRole("checkbox").check();
    for (const width of [390, 1440]) {
      await sellerPage.setViewportSize({ width, height: 1000 });
      expect(
        await sellerPage.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const scan = await new AxeBuilder({ page: sellerPage })
        .include("dialog")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(scan.violations.map((v) => v.id)).toEqual([]);
      await sellerPage.screenshot({
        path: `output/playwright/withdrawal-request-${width}.png`,
      });
    }
    await dialog
      .getByRole("button", { name: "ส่งคำขอถอนเงิน", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(panel.getByText("฿40", { exact: true })).toBeVisible();
    await page.goto("/admin/withdrawals");
    let row = page.getByRole("row").filter({ hasText: prefix });
    await row.getByRole("button", { name: "อนุมัติ", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "อนุมัติคำขอถอน", exact: true });
    await expect(dialog).toContainText("1234567890");
    await dialog
      .getByRole("button", { name: "อนุมัติคำขอถอน", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await page.getByLabel("สถานะคำขอ").selectOption("approved");
    row = page.getByRole("row").filter({ hasText: prefix });
    await row
      .getByRole("button", { name: "รับดำเนินการโอน", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "รับดำเนินการโอน", exact: true })
      .getByRole("button", { name: "รับดำเนินการโอน", exact: true })
      .click();
    dialog = page.getByRole("dialog", { name: "บันทึกโอนเงิน", exact: true });
    await dialog
      .getByLabel("เลขอ้างอิงการโอนสำเร็จ")
      .fill("OUT-" + crypto.randomUUID());
    await dialog.getByRole("checkbox").check();
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const scan = await new AxeBuilder({ page })
        .include("dialog")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(scan.violations.map((v) => v.id)).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `output/playwright/withdrawal-approval-${width}.png`,
      });
    }
    await dialog
      .getByRole("button", { name: "บันทึกโอนเงิน", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await sellerPage.reload();
    await expect(panel).toContainText("โอนแล้ว");
    await expect(panel.getByText("฿40", { exact: true })).toBeVisible();
    await panel
      .getByRole("button", { name: "แจ้งถอนเงิน", exact: true })
      .click();
    dialog = sellerPage.getByRole("dialog", {
      name: "แจ้งถอนรายได้ฝากขาย",
      exact: true,
    });
    await dialog.getByLabel("ยอดถอน (บาท)").fill("20");
    await dialog.getByLabel("ธนาคารรับเงิน").selectOption("014");
    await dialog.getByLabel("เลขบัญชีรับเงิน").fill("1234567890");
    await dialog.getByLabel("ชื่อบัญชีรับเงิน").fill("ตัวแทน ทดสอบ");
    await dialog.getByRole("checkbox").check();
    await dialog
      .getByRole("button", { name: "ส่งคำขอถอนเงิน", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await panel
      .getByRole("button", { name: "ยกเลิกคำขอ", exact: true })
      .click();
    dialog = sellerPage.getByRole("dialog", {
      name: "ยกเลิกคำขอถอน",
      exact: true,
    });
    await dialog
      .getByRole("button", { name: "ยืนยันยกเลิกคำขอ", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(panel.getByText("฿40", { exact: true })).toBeVisible();
    await expect(panel).toContainText("ยกเลิกแล้ว");
    await panel
      .getByRole("button", { name: "แจ้งถอนเงิน", exact: true })
      .click();
    dialog = sellerPage.getByRole("dialog", {
      name: "แจ้งถอนรายได้ฝากขาย",
      exact: true,
    });
    await dialog.getByLabel("ยอดถอน (บาท)").fill("10");
    await dialog.getByLabel("ธนาคารรับเงิน").selectOption("014");
    await dialog.getByLabel("เลขบัญชีรับเงิน").fill("1234567890");
    await dialog.getByLabel("ชื่อบัญชีรับเงิน").fill("ตัวแทน ทดสอบ");
    await dialog.getByRole("checkbox").check();
    await dialog
      .getByRole("button", { name: "ส่งคำขอถอนเงิน", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await page.getByLabel("สถานะคำขอ").selectOption("pending");
    await page
      .getByRole("row")
      .filter({ hasText: prefix })
      .getByRole("button", { name: "ปฏิเสธ", exact: true })
      .click();
    dialog = page.getByRole("dialog", { name: "ปฏิเสธคำขอถอน", exact: true });
    await dialog
      .getByRole("button", { name: "ปฏิเสธคำขอถอน", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toContainText("กรุณาตรวจสอบ");
    await dialog
      .getByLabel("เหตุผลที่ไม่อนุมัติ")
      .fill("บัญชีรับเงินไม่ถูกต้อง");
    await dialog
      .getByRole("button", { name: "ปฏิเสธคำขอถอน", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await sellerPage.reload();
    await expect(panel).toContainText("ไม่อนุมัติ");
    await expect(panel).toContainText("บัญชีรับเงินไม่ถูกต้อง");
    await expect(panel.getByText("฿40", { exact: true })).toBeVisible();
    await page.goto("/admin/roles");
    await page.getByRole("button", { name: "เพิ่มบทบาท", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "เพิ่มบทบาท", exact: true });
    const roleName = "ผู้อนุมัติถอน " + crypto.randomUUID().slice(0, 6);
    await dialog.getByLabel("ชื่อบทบาท").fill(roleName);
    const approval = dialog.getByLabel("อนุมัติหรือปฏิเสธคำขอถอนเงินตัวแทน", {
        exact: true,
      }),
      view = dialog.getByLabel("ดูคำขอถอนเงินตัวแทน", { exact: true }),
      finance = dialog.getByLabel("ดูรายรับ–รายจ่ายและธุรกรรมกระเป๋าเงิน", {
        exact: true,
      });
    await approval.check();
    await expect(view).toBeChecked();
    await expect(finance).toBeChecked();
    await expect(
      dialog.getByLabel("บันทึกโอนเงินตามคำขอถอนที่อนุมัติแล้ว", {
        exact: true,
      }),
    ).not.toBeChecked();
    await finance.uncheck();
    await expect(approval).not.toBeChecked();
    await expect(view).not.toBeChecked();
    await approval.check();
    await dialog
      .getByRole("button", { name: "ตรวจสอบสิทธิ์", exact: true })
      .click();
    await page
      .getByRole("button", { name: "บันทึกสิทธิ์บทบาท", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: roleName, exact: true }),
    ).toBeVisible();
    const roles = await (await page.request.get("/api/admin/roles")).json();
    expect(
      roles.roles.find((r: any) => r.name === roleName).permissions.sort(),
    ).toEqual(["finance", "withdrawals", "withdrawals_approve"]);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
