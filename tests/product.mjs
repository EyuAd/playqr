import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import jsQR from "jsqr";
const browser = await chromium.launch({ channel: "chrome", headless: true, timeout: 30000 });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.setDefaultTimeout(20000);
console.log('Browser ready');
const app = {
  id: "com.spotify.music",
  title: "Spotify: Music and Podcasts",
  developer: "Spotify AB",
  icon: "https://play-lh.googleusercontent.com/IzQgYCcnCFCD08GR-3bdtcT8xzOvrNkC84avGT5CwTX2VIqmTmKKJcP_Cd4JoBOdmCMlTndlOzV6hrthg2fOWA",
  rating: 4.3,
  price: "0",
};
const notes = {
  id: "com.example.notes",
  title: "Notes test fixture",
  developer: "Test data",
};
try {
  await page.addInitScript(
    ({ app, notes }) => {
      if (!localStorage.getItem("playqr-product-test")) {
        localStorage.setItem("playqr-product-test", "1");
        localStorage.setItem(
          "playqr-library-v2",
          JSON.stringify({
            recent: [app],
            collections: [
              {
                id: "test-draft",
                title: "My Android setup",
                description: "A local test draft",
                apps: [app, notes],
              },
            ],
          }),
        );
      }
    },
    { app, notes },
  );
  await page.goto(
    (process.env.PLAYQR_TEST_URL || "http://127.0.0.1:5173/") +
      "#collection/test-draft",
  );
  await page
    .getByRole("button", {
      name: "Move Spotify: Music and Podcasts down",
      exact: true,
    })
    .click();
  assert.match(
    await page.locator(".collection-row").first().innerText(),
    /Notes test fixture/,
  );
  await page.reload();
  assert.match(
    await page.locator(".collection-row").first().innerText(),
    /Notes test fixture/,
  );
  await page.getByRole("button", { name: "Duplicate collection" }).click();
  await page.waitForFunction(() => location.hash !== "#collection/test-draft");
  assert.equal(
    await page
      .getByRole("textbox", { name: "Collection title", exact: true })
      .inputValue(),
    "My Android setup (copy)",
  );
  await page.getByRole("button", { name: "Delete draft", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(await page.locator(".collection-row").count(), 2);
  await page.getByRole("button", { name: "Delete draft", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete draft", exact: true })
    .click();
  await page.waitForURL("**/#collections");
  assert.equal(await page.locator(".collection-card").count(), 1);
  await page.goto(
    (process.env.PLAYQR_TEST_URL || "http://127.0.0.1:5173/") +
      "#app/com.spotify.music",
  );
  await page.getByRole("button", { name: "Create share card" }).click();
  const download = page.getByRole("button", { name: "Download card" });
  await download.waitFor();
  await page.waitForFunction(
    () => !document.querySelector(".share-card-dialog > button").disabled,
  );
  const canvas = page.locator(".share-card-preview");
  const pixels = await canvas.evaluate((c) => ({
    data: Array.from(
      c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
    ),
    width: c.width,
    height: c.height,
  }));
  assert.equal(
    jsQR(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height)?.data,
    "https://play.google.com/store/apps/details?id=com.spotify.music",
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await canvas.screenshot({ path: "test-results/share-card.png" });
  const pending = page.waitForEvent("download");
  await download.click();
  assert.match((await pending).suggestedFilename(), /^playqr-card-.*\.png$/);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  console.log(
    "PASS: reorder persistence, independent duplication, cancel/confirm deletion, card preview, exact QR decode, PNG download, mobile layout",
  );
} catch(error) {
  console.log(await page.locator('body').innerText());
  throw error;
} finally {
  await browser.close();
}

