import { test, expect } from "@playwright/test";
test.skip(
  !process.env.PWA_TEST,
  "Run against the production preview with PWA_TEST=1",
);
test("installed service worker reopens the app offline", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "خطوتك الأولى نحو التوازن." }),
  ).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "خطوتك الأولى نحو التوازن." }),
  ).toBeVisible();
  await expect(page.locator(".app, .bottom-nav")).toHaveCount(0);
  await context.setOffline(false);
});
