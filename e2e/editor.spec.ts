import { test, expect } from "@playwright/test";
test.skip(!!process.env.PWA_TEST, "Isolated editor test uses the Vite development transform.");
test("manual calories react to macros and quantity and save the derived result", async ({ page }) => {
  // Test-only document; no login bypass or test route is shipped in the app.
  await page.route("**/editor-test", route => route.fulfill({ contentType: "text/html", body: `
    <div id="root"></div><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      const { default: React } = await import('/node_modules/.vite/deps/react.js');
      const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
      const { default: Editor } = await import('/src/Editor.tsx');
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Editor, {
        ar: true, onClose: () => {}, onSave: async (p,q) => { window.saved = {p,q}; }
      }));
    </script>` }));
  await page.goto("/editor-test");
  await page.getByLabel("اسم الطعام").fill("اختبار الماكروز");
  await expect(page.getByRole("spinbutton", { name: "السعرات", exact: true })).toHaveCount(0);
  await page.getByLabel("البروتين", { exact: true }).fill("1");
  await expect(page.getByLabel("السعرات المحسوبة")).toHaveText("4 kcal");
  await page.getByLabel("الكربوهيدرات", { exact: true }).fill("2");
  await page.getByLabel("الدهون", { exact: true }).fill("1");
  await expect(page.getByLabel("السعرات المحسوبة")).toHaveText("21 kcal");
  const quantity = page.getByRole("spinbutton", { name: "الكمية" });
  for (let index = 0; index < 100; index++) await quantity.press("ArrowUp");
  await expect(page.locator(".preview")).toContainText("السعرات 42");
  await page.getByRole("button", { name: "تأكيد وتسجيل" }).click();
  expect(await page.evaluate(() => (window as unknown as {saved: unknown}).saved)).toMatchObject({p: {nutrients: {kcal:21, protein:1, carbs:2, fat:1}}, q:200});
  await page.getByLabel("البروتين", { exact: true }).fill("");
  await expect(page.getByLabel("السعرات المحسوبة")).toHaveText("— kcal");
});
