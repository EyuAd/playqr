import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1050 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => {
  if (r.url().includes(":8787"))
    console.log(r.status(), new URL(r.url()).pathname);
});
try {
  await page.goto("http://127.0.0.1:5173/");
  await page.getByRole("heading", { name: "Good apps travel." }).waitFor();
  await page.screenshot({ path: "docs/desktop.png", fullPage: true });
  await page.getByRole("searchbox").fill("Spotify");
  await page.getByRole("button", { name: "Find app" }).click();
  await page.locator(".app-card").first().waitFor({ timeout: 60000 });
  console.log("Search cards:", await page.locator(".app-card").count());
  const first = page.locator(".app-card").first();
  await first.locator("img").evaluate((img) => img.decode());
  await first.locator(".app-open").click();
  await page.locator("canvas").waitFor();
  assert.equal(await page.locator("canvas").getAttribute("width"), "1024");
  assert.equal(
    await page
      .locator("canvas")
      .evaluate(
        (c) => c.getBoundingClientRect().width <= c.parentElement.clientWidth,
      ),
    true,
  );
  await page.getByRole("button", { name: "Create smart link" }).click();
  await page
    .getByRole("button", { name: "Smart link ready" })
    .waitFor({ timeout: 30000 });
  const link = await page
    .getByRole("textbox", { name: "Share destination" })
    .inputValue();
  assert.match(link, /\/a\/[a-f0-9]{16}$/);
  const response = await page.request.get(link, {
    maxRedirects: 0,
    headers: { "User-Agent": "Android test", DNT: "1" },
  });
  assert.equal(response.status(), 302);
  assert.match(
    response.headers().location,
    /^https:\/\/play.google.com\/store\/apps\/details\?id=/,
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "↓ SVG" }).click();
  assert.match((await download).suggestedFilename(), /\.svg$/);
  await page.getByRole("button", { name: "+ Collection", exact: true }).click();
  await page
    .getByRole("textbox", { name: "New collection title" })
    .fill("Browser verification");
  await page.getByRole("button", { name: "Create & add" }).click();
  await page.getByRole("link", { name: /Collections/ }).click();
  await page.getByRole("link", { name: /Browser verification/ }).click();
  await page.getByRole("button", { name: "Publish collection" }).click();
  await page
    .getByRole("heading", { name: "Browser verification" })
    .waitFor({ timeout: 30000 });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.waitForFunction(
    () => !document.querySelector("#toast").classList.contains("visible"),
  );
  await page.screenshot({ path: "docs/mobile-collection.png", fullPage: true });
  await page.getByRole("link", { name: "PlayQR home" }).click();
  await page.getByRole("searchbox").fill("TakeCare by Marriott");
  await page.getByRole("button", { name: "Find app" }).click();
  await page
    .locator(".search-results .app-card")
    .first()
    .waitFor({ timeout: 60000 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({ path: "docs/mobile-search.png", fullPage: true });
  await page.getByRole("button", { name: /Switch to dark/ }).click();
  await page.screenshot({ path: "docs/mobile-dark.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: real search, original icon, QR, smart redirect, SVG download, collection publishing, mobile overflow, dark mode",
  );
} catch (error) {
  console.log(await page.locator("main").innerText());
  await page.screenshot({ path: "test-results/failure.png", fullPage: true });
  throw error;
} finally {
  await browser.close();
}

