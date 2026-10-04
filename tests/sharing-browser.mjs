import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import jsQR from "jsqr";

const site = process.env.PLAYQR_TEST_URL || "http://127.0.0.1:5173/";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const app = {
  id: "com.spotify.music",
  title: "Spotify: Music and Podcasts",
  developer: "Spotify AB",
  description: "Music and podcasts.",
  icon: "https://play-lh.googleusercontent.com/IzQgYCcnCFCD08GR-3bdtcT8xzOvrNkC84avGT5CwTX2VIqmTmKKJcP_Cd4JoBOdmCMlTndlOzV6hrthg2fOWA",
};
const destination =
  "https://play.google.com/store/apps/details?id=com.spotify.music";
try {
  await mkdir("test-results", { recursive: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  const errors = [],
    external = [];
  await page.addInitScript(() => {
    window.testFileSharing = false;
    window.testShares = [];
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => window.testFileSharing,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data) => {
        window.testShares.push({
          title: data.title,
          files: data.files?.map((file) => ({
            name: file.name,
            type: file.type,
            size: file.size,
          })),
        });
      },
    });
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (/twitter\.com|t\.me|wa\.me/.test(r.url())) external.push(r.url());
  });
  await page.route("**/auth/config", (r) =>
    r.fulfill({ json: { enabled: false } }),
  );
  await page.route(/\/app\?/, (r) => r.fulfill({ json: { app } }));
  await page.route("**/links", (r) =>
    r.fulfill({
      json: { url: "https://eyubuilds.tech/a/fixture1", code: "fixture1" },
    }),
  );
  await page.route("**/links/fixture1", (r) =>
    r.fulfill({
      json: {
        link: { title: "Android setup", kind: "collection" },
        apps: [app],
      },
    }),
  );
  await page.route("**/library", (r) =>
    r.fulfill({
      json: {
        links: [
          {
            code: "fixture1",
            title: "Android setup with a deliberately long collection title",
            kind: "collection",
            total: 1234,
          },
          { code: "fixture2", title: "Music", kind: "app", total: 0 },
        ],
      },
    }),
  );
  await page.goto(site + "#app/com.spotify.music", {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("button", { name: "Share via", exact: true }).click();
  const dialog = page.getByRole("dialog");
  for (const network of ["X", "Telegram", "WhatsApp", "Email"]) {
    const link = dialog.getByRole("link", {
      name: `Share via ${network}`,
      exact: true,
    });
    assert.equal(await link.getAttribute("rel"), "noopener noreferrer");
    const href = new URL(await link.getAttribute("href"));
    assert.equal(
      href.searchParams.get(
        network === "Email" ? "body" : network === "WhatsApp" ? "text" : "url",
      ),
      ["Email", "WhatsApp"].includes(network)
        ? `${app.title}\n${destination}`
        : destination,
    );
  }
  await page.keyboard.press("Escape");
  assert.equal(await dialog.count(), 0);
  await page
    .getByRole("button", { name: "Create smart link", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Smart link ready ✓", exact: true })
    .waitFor();
  const smart = await page
    .getByLabel("Share destination", { exact: true })
    .inputValue();
  await page.getByRole("button", { name: "Share via", exact: true }).click();
  assert.equal(
    new URL(
      await dialog
        .getByRole("link", { name: "Share via Telegram" })
        .getAttribute("href"),
    ).searchParams.get("url"),
    smart,
  );
  await dialog
    .getByRole("button", { name: "QR card / PDF", exact: true })
    .click();
  const pdf = page.getByRole("button", {
    name: "Download card · PDF",
    exact: true,
  });
  await pdf.waitFor();
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".card-export-actions button")].every(
      (b) => !b.disabled,
    ),
  );
  const pixels = await page.locator(".share-card-preview").evaluate((c) => ({
    width: c.width,
    height: c.height,
    data: Array.from(
      c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
    ),
  }));
  assert.equal(
    jsQR(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height)?.data,
    smart,
  );
  const pending = page.waitForEvent("download");
  await pdf.click();
  const downloaded = await pending;
  assert.match(downloaded.suggestedFilename(), /^playqr-card-.*\.pdf$/);
  await downloaded.saveAs("test-results/share-card.pdf");
  const bytes = await readFile("test-results/share-card.pdf");
  assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
  assert.ok(
    bytes.includes(Buffer.from(`/URI (${smart})`)),
    "PDF annotation matches QR",
  );
  const fallback = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Share PDF", exact: true }).click();
  assert.match((await fallback).suggestedFilename(), /\.pdf$/);
  await page.evaluate(() => {
    window.testFileSharing = true;
  });
  await dialog.getByRole("button", { name: "Share PDF", exact: true }).click();
  const nativeShares = await page.evaluate(() => window.testShares);
  assert.equal(nativeShares.length, 1);
  assert.equal(nativeShares[0].files[0].type, "application/pdf");
  assert.ok(nativeShares[0].files[0].size > 1000);
  for (const theme of ["light", "dark"]) {
    if (theme === "dark") {
      await page.keyboard.press("Escape");
      await page
        .getByRole("button", { name: "Switch to dark mode", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Create share card", exact: false })
        .click();
      await pdf.waitFor();
      await page.waitForFunction(() =>
        [...document.querySelectorAll(".card-export-actions button")].every(
          (b) => !b.disabled,
        ),
      );
    }
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      const layout = await dialog.evaluate((d) => {
        const bounds = d.getBoundingClientRect();
        const close = d.querySelector(".share-close").getBoundingClientRect();
        return {
          left: bounds.left,
          right: bounds.right,
          width: innerWidth,
          closeTop: close.top,
          closeBottom: close.bottom,
          height: innerHeight,
          overflow: d.scrollWidth > d.clientWidth,
        };
      });
      assert.ok(
        layout.left >= 0 && layout.right <= layout.width && !layout.overflow,
      );
      assert.ok(
        layout.closeTop >= 0 && layout.closeBottom <= layout.height,
        "close always reachable",
      );
      if ([390, 1440].includes(width))
        await page.screenshot({
          path: `test-results/sharing-${theme}-${width}.png`,
          fullPage: false,
        });
    }
  }
  await page.keyboard.press("Escape");
  await page.goto(site + "#share/fixture1", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Share via", exact: true }).click();
  assert.match(
    await dialog
      .getByRole("link", { name: "Share via X", exact: true })
      .getAttribute("href"),
    /fixture1/,
  );
  await page.keyboard.press("Escape");
  await page.goto(site + "#dashboard", { waitUntil: "domcontentloaded" });
  await page.locator(".stats").waitFor();
  for (const theme of ["dark", "light"]) {
    if (theme === "light")
      await page
        .getByRole("button", { name: "Switch to light mode", exact: true })
        .click();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      const tops = await page
        .locator(".stats strong")
        .evaluateAll((nodes) =>
          nodes.map((n) => n.getBoundingClientRect().top),
        );
      assert.ok(
        Math.max(...tops) - Math.min(...tops) < 1,
        "stat values share a baseline",
      );
      const actions = await page
        .locator(".link-row")
        .first()
        .locator(".link-actions > *")
        .evaluateAll((nodes) =>
          nodes.map((n) => n.getBoundingClientRect().top),
        );
      assert.ok(
        Math.max(...actions) - Math.min(...actions) < 1,
        "link actions align",
      );
      if (width === 390) await page.locator(".stats").scrollIntoViewIfNeeded();
      if (width === 390)
        await page.screenshot({
          path: `test-results/library-${theme}-390.png`,
          fullPage: false,
        });
    }
  }
  assert.deepEqual(external, [], "nothing posted or sent without a click");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: share intents, current smart destination, app/collection sharing, clickable PDF download, PDF share fallback, QR decode, modal bounds, mobile stat baseline and touch actions in both themes",
  );
} finally {
  await browser.close();
}
