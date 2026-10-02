import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import jsQR from "jsqr";
const site = process.env.PLAYQR_TEST_URL || "http://127.0.0.1:5173/";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1080 },
  colorScheme: "light",
});
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const assertFits = async () =>
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
try {
  await mkdir("test-results", { recursive: true });
  await page.goto(site);
  await page.locator(".hero h1").waitFor();
  await page.getByText("Scan to open PlayQR", { exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  const pixels = await page.locator(".passport-canvas").evaluate((canvas) => ({
    data: [
      ...canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height)
        .data,
    ],
    width: canvas.width,
    height: canvas.height,
  }));
  assert.match(
    jsQR(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height).data,
    /^https:\/\//,
  );
  await page.keyboard.press("/");
  assert.equal(
    await page
      .locator("#app-search")
      .evaluate((e) => e === document.activeElement),
    true,
  );
  await page.locator(".hero h1").click();
  await page.screenshot({
    path: "test-results/redesign-desktop-light.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await page.screenshot({
    path: "test-results/redesign-desktop-dark.png",
    fullPage: true,
  });
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await assertFits();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/redesign-mobile-dark.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await page.screenshot({
    path: "test-results/redesign-mobile-light.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Your library", exact: true }).click();
  await page
    .getByRole("button", { name: "Import backup", exact: true })
    .waitFor();
  const input = page.getByLabel("Import library backup");
  await input.setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from("{}"),
  });
  await page
    .getByText("This is not a supported PlayQR library backup.")
    .waitFor();
  assert.equal(await page.locator("dialog").count(), 0);
  const imported = {
    format: "playqr-library",
    version: 1,
    library: {
      favorites: [
        { id: "com.spotify.music", title: "Spotify", developer: "Spotify AB" },
      ],
      collections: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          title: "Backup test collection",
          description: "A test draft",
          apps: [{ id: "ios:324684580", title: "Spotify" }],
        },
      ],
    },
  };
  await input.setInputFiles({
    name: "library.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(imported)),
  });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(await page.locator(".app-card").count(), 0);
  await input.setInputFiles({
    name: "library.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(imported)),
  });
  await page
    .getByRole("button", { name: "Import library", exact: true })
    .click();
  await page.locator(".app-card").first().waitFor();
  await page.reload();
  await page.locator(".app-card").first().waitFor();
  assert.equal(await page.locator(".app-card").count(), 1);
  await assertFits();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export backup", exact: true })
    .click();
  const result = JSON.parse(
    await readFile(await (await downloaded).path(), "utf8"),
  );
  assert.equal(result.library.favorites[0].id, "com.spotify.music");
  assert.deepEqual(Object.keys(result.library), ["favorites", "collections"]);
  await page.getByLabel("Import library backup").setInputFiles({
    name: "library.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(imported)),
  });
  await page.getByText(/0 new favorites and 0 new collection drafts/).waitFor();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.screenshot({
    path: "test-results/redesign-library-mobile.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: /^Collections/ }).click();
  await page.getByRole("link", { name: /Backup test collection/ }).click();
  await page.getByLabel("Collection title", { exact: true }).waitFor();
  await assertFits();
  await page.screenshot({
    path: "test-results/redesign-editor-mobile.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Account", exact: true }).click();
  await page
    .getByText("Sign-in setup is in progress", { exact: true })
    .waitFor();
  await assertFits();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: desktop/mobile themes, real passport QR, keyboard search, 5 viewport widths, safe backup validation/cancel/import/export/reload/deduplication, editor and disabled-auth layout",
  );
} finally {
  await browser.close();
}
