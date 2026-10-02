import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  colorScheme: "light",
});
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await mkdir("test-results", { recursive: true });
  await page.goto(process.env.PLAYQR_TEST_URL || "http://127.0.0.1:5173/", {
    waitUntil: "domcontentloaded",
  });
  await page.locator(".step-art svg").first().waitFor();
  assert.equal(await page.locator(".step-art svg").count(), 3);
  assert.equal(await page.locator('.step-art[aria-hidden="true"]').count(), 3);
  await page.evaluate(() => document.fonts.ready);
  await page
    .locator(".how")
    .screenshot({ path: "test-results/illustrations-light.png" });
  const light = await page
    .locator(".step-art")
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  const dark = await page
    .locator(".step-art")
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  assert.notEqual(light, dark);
  await page
    .locator(".how")
    .screenshot({ path: "test-results/illustrations-dark.png" });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    assert.ok(
      (await page.locator(".step-art svg").first().boundingBox()).width > 150,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await page
    .locator(".how")
    .screenshot({ path: "test-results/illustrations-mobile.png" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page
      .locator(".scene-lift")
      .first()
      .evaluate((el) => getComputedStyle(el).transitionDuration),
    "0s",
  );
  await page.locator('.how a[href="#collections"]').click();
  await page.getByRole("heading", { name: "A setup worth sharing." }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: three responsive SVG scenes, distinct light/dark palettes, 4 widths without overflow, reduced-motion support and unchanged feature navigation",
  );
} finally {
  await browser.close();
}
