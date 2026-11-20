import { test, expect } from "@playwright/test";
test.skip(
  !process.env.E2E_AUTH_STORAGE_STATE,
  "Requires a signed-in disposable test account; guest access has been removed.",
);
test("responsive RTL/LTR has no horizontal overflow", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "يومك، بتوازن." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  if (info.project.name === "chromium")
    await page.screenshot({ path: "../MakkiHero-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your day, in balance." }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  if (info.project.name === "chromium")
    await page.screenshot({ path: "../MakkiHero-desktop.png", fullPage: true });
});
test("logging works while network is offline", async ({ page, context }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "تسجيل يدوي" }).click();
  await context.setOffline(true);
  await page.getByLabel("اسم الطعام").fill("Offline meal");
  for (const label of ["البروتين", "الكربوهيدرات", "الدهون"])
    await page.getByLabel(label, { exact: true }).fill("10");
  await page.getByRole("button", { name: "تأكيد وتسجيل" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("Offline meal").first()).toBeVisible();
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByText("Offline meal").first()).toBeVisible();
});
