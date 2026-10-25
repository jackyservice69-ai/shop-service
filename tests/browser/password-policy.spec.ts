import { test, expect } from "@playwright/test";

test("eight-character registration and password change work; seven is rejected in the form", async ({
  page,
}) => {
  const email = crypto.randomUUID() + "@password.test";
  await page.goto("/register");
  await page.getByLabel("ชื่อหน้า").fill("ลูกค้า");
  await page.getByLabel("นามสกุล").fill("แปดตัวอักษร");
  await page.getByLabel("เบอร์โทร").fill("0812345678");
  await page.getByLabel("อีเมล").fill(email);
  const password = page.getByLabel("รหัสผ่าน");
  await expect(password).toHaveAttribute("minlength", "8");
  await expect(
    page.getByText("อย่างน้อย 8 ตัวอักษร", { exact: true }),
  ).toBeVisible();
  await password.fill("Aa12!xy");
  await page.getByRole("button", { name: "สร้างบัญชี", exact: true }).click();
  await expect(password).toHaveAttribute("aria-invalid", "true");
  await expect(page).toHaveURL("/register");
  await password.fill("Aa12!xyz");
  await page.getByRole("button", { name: "สร้างบัญชี", exact: true }).click();
  await expect(page).toHaveURL("/");
  await page.goto("/account");
  const replacement = page.getByLabel("รหัสผ่านใหม่");
  await expect(replacement).toHaveAttribute("minlength", "8");
  await page.getByLabel("รหัสผ่านปัจจุบัน").fill("Aa12!xyz");
  await replacement.fill("Bb34!xyz");
  await page
    .getByRole("button", { name: "เปลี่ยนรหัสผ่าน", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByLabel("รหัสผ่าน")).not.toHaveAttribute("minlength");
  await page.getByLabel("อีเมล").fill(email);
  await page.getByLabel("รหัสผ่าน").fill("Bb34!xyz");
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(page).toHaveURL("/");
});
