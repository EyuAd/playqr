import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import jsQR from "jsqr";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  colorScheme: "light",
});
page.setDefaultTimeout(45000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(process.env.PLAYQR_TEST_URL || "http://127.0.0.1:5173/", {
    waitUntil: "domcontentloaded",
  });
  await page.getByLabel("App store", { exact: true }).selectOption("android");
  await page.getByRole("searchbox").fill("TakeCare by Marriott");
  await page.getByRole("button", { name: "Find app" }).click();
  const first = page.locator(".search-results .app-card").first();
  await first.waitFor();
  assert.match(await first.innerText(), /TakeCare/i);
  await first.locator("img").evaluate((image) => image.decode());
  assert.equal(
    await first.locator("img").evaluate((image) => image.naturalWidth > 0),
    true,
  );
  assert.ok(
    (await first.boundingBox()).y < 650,
    "Search results appear without a tall marketing hero above them",
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: "test-results/redesign-search-mobile.png",
    fullPage: true,
  });
  await first.locator(".app-open").click();
  await page.locator(".qr-stage canvas").waitFor();
  const destination = await page.getByLabel("Share destination").inputValue();
  assert.match(
    destination,
    /^https:\/\/play.google.com\/store\/apps\/details\?id=/,
  );
  const pixels = await page
    .locator(".qr-stage canvas")
    .evaluate((c) => ({
      data: [...c.getContext("2d").getImageData(0, 0, c.width, c.height).data],
      width: c.width,
      height: c.height,
    }));
  assert.equal(
    jsQR(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height).data,
    destination,
  );
  await page.screenshot({
    path: "test-results/redesign-app-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/redesign-app-desktop.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Back to discovery" }).click();
  assert.equal(
    await page.getByRole("searchbox").inputValue(),
    "TakeCare by Marriott",
  );
  assert.equal(
    await page.getByLabel("App store", { exact: true }).inputValue(),
    "android",
  );
  await first.waitFor();
  await page.getByRole("searchbox").fill("https://example.com/not-a-store");
  await page.getByRole("button", { name: "Find app" }).click();
  assert.equal(await page.locator(".search-results .app-card").count(), 0);
  assert.equal(
    await page.locator(".search-results").getAttribute("aria-busy"),
    null,
  );
  await page.getByRole("searchbox").fill("");
  assert.equal(await page.locator(".exchange-art").isVisible(), true);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: real TakeCare search, authentic loaded icon, direct exact-app QR decode, compact mobile results, preserved query/store on return, invalid-input cleanup",
  );
} finally {
  await browser.close();
}
