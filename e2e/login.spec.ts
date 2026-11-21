import { test, expect } from "@playwright/test";

test("signed-out visitors only see login, including reload and direct navigation", async ({
  page,
}) => {
  await page.goto("/#settings");
  await expect(
    page.getByRole("heading", { name: "تتبّع السعرات والماكروز" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "تسجيل الدخول بحساب Google" }),
  ).toBeVisible();
  if (process.env.PWA_TEST)
    await expect(
      page.getByRole("button", { name: "تسجيل الدخول بحساب Google" }),
    ).toBeEnabled();
  await expect(page.locator(".app, .bottom-nav, .sidebar")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "تسجيل يدوي" })).toHaveCount(0);
  await page.evaluate(() => {
    localStorage.setItem("uid", "fake-user");
    localStorage.setItem("page", "home");
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "تسجيل الدخول بحساب Google" }),
  ).toBeVisible();
  await expect(page.locator(".app")).toHaveCount(0);
});

test("login is responsive in Arabic and English", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "تسجيل الدخول بحساب Google" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Calories & macro tracker" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
