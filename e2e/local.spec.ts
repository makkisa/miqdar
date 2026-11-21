import { test, expect } from "@playwright/test";
test.skip(
  !process.env.E2E_AUTH_STORAGE_STATE,
  "Requires a signed-in disposable test account; guest access has been removed.",
);
test("manual log survives reload, can edit, delete and undo", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "تسجيل يدوي" }).click();
  await page.getByLabel("اسم الطعام").fill("وجبة اختبار");
  await page.getByLabel("البروتين", { exact: true }).fill("10");
  await page.getByLabel("الكربوهيدرات", { exact: true }).fill("20");
  await page.getByLabel("الدهون", { exact: true }).fill("5");
  await page.getByRole("button", { name: "تأكيد وتسجيل" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.reload();
  await expect(page.getByText("وجبة اختبار").first()).toBeVisible();
  await page.getByRole("button", { name: "تعديل", exact: true }).click();
  const quantity = page.getByRole("spinbutton", { name: "الكمية" });
  for (let index = 0; index < 50; index++) await quantity.press("ArrowUp");
  await page.getByRole("button", { name: "تأكيد وتسجيل" }).click();
  await expect(page.getByText("150 g · 247.5 kcal")).toBeVisible();
  await page.getByRole("button", { name: "حذف", exact: true }).click();
  await page.getByRole("button", { name: "تراجع", exact: true }).click();
  await expect(page.getByText("150 g · 247.5 kcal")).toBeVisible();
});
test("similar OFF results require review", async ({ page }) => {
  await page.route("**/cgi/search.pl?**", (route) =>
    route.fulfill({
      json: {
        products: [
          {
            code: "12345678",
            product_name: "Similar food",
            nutriments: { "energy-kcal_100g": 100 },
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await page
    .locator(".bottom-nav")
    .getByRole("button", { name: "مكتبتي" })
    .click();
  await page.getByRole("textbox", { name: "بحث", exact: true }).fill("food");
  await page.getByRole("button", { name: "البحث في Open Food Facts" }).click();
  await expect(
    page.getByText("هذه منتجات مشابهة وليست مطابقة.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Similar food · مراجعة" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("البروتين", { exact: true })).toHaveValue("");
});
