import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";

const site = process.env.PLAYQR_TEST_URL || "http://127.0.0.1:5173/";
const origin = new URL(site).origin;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://fonts.googleapis.com/**", (route) =>
    route.fulfill({ contentType: "text/css", body: "" }),
  );
  await page.route("**/ui-polish-test", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>UI polish fixture</title></head><body><main id="main"></main><div id="toast" role="status"></div><div style="height:1200px"></div></body></html>',
    }),
  );
  // Exercise the real panel orchestration with deterministic renderer failures.
  await page.route(/\/src\/qr\.js(?:\?.*)?$/, (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `export async function renderQR(canvas, url, settings) {
        const test = window.polish;
        test.draws.push({ url, settings });
        if (test.failNext) { test.failNext = false; throw new Error("Fixture render failure"); }
        if (settings.color === "#173e82") await new Promise(resolve => setTimeout(resolve, 80));
        canvas.width = canvas.height = settings.size;
        canvas.getContext("2d").fillStyle = settings.color;
        canvas.getContext("2d").fillRect(0, 0, settings.size, settings.size);
      }
      export async function exportQR(url, settings, format) {
        window.polish.exports.push({url, settings, format});
        await new Promise(resolve => setTimeout(resolve, 120));
      }`,
    }),
  );
  await page.route(/\/src\/share-card\.js(?:\?.*)?$/, (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `import { showShareDialog } from "/src/sharing.js";
      export async function openShareCard(options) {
        window.polish.cards.push(options);
        const dialog = document.createElement("dialog");
        dialog.setAttribute("aria-label", "Fixture card");
        const close = document.createElement("button");
        close.className = "share-close";
        close.textContent = "Close";
        close.onclick = () => dialog.close();
        dialog.append(close);
        showShareDialog(dialog);
        await new Promise(resolve => setTimeout(resolve, 200));
      }`,
    }),
  );
  await page.goto(origin + "/ui-polish-test", {
    waitUntil: "domcontentloaded",
  });
  await page.evaluate(async () => {
    await import("/src/styles.css");
    const { appCard } = await import("/src/ui.js");
    const { qrPanel } = await import("/src/qr-panel.js");
    window.polish = {
      draws: [],
      exports: [],
      cards: [],
      saved: false,
      failSave: false,
      failNext: false,
      publishes: 0,
    };
    const app = {
      id: "com.example.notes",
      title: "Notes",
      developer: "Example",
    };
    document.querySelector("main").append(
      appCard(
        app,
        () => {},
        () => {
          if (window.polish.failSave) throw new Error("Could not save fixture");
          return (window.polish.saved = !window.polish.saved);
        },
        false,
        () => {},
      ),
      await qrPanel(
        "Notes",
        "https://play.google.com/store/apps/details?id=com.example.notes",
        async () => {
          window.polish.publishes++;
          await new Promise((resolve) => {
            window.polish.finishPublish = resolve;
          });
          return { url: "https://eyubuilds.tech/a/ui-fixture" };
        },
      ),
    );
  });

  assert.deepEqual(
    await page.evaluate(async () => {
      const { metadata } = await import("/src/ui.js");
      return [
        metadata(null),
        metadata({ category: 7, rating: {}, price: [], currency: null }),
        metadata({ category: "Tools", rating: "4.75", price: "0" }),
        metadata({
          category: "MUSIC_AUDIO",
          rating: 4.3,
          price: "4.99",
          currency: "USD",
        }),
        metadata({ rating: Infinity, price: NaN, currency: "undefined" }),
        metadata({ rating: -2, price: "4.99" }),
        metadata({ price: 0, currency: { code: "USD" } }),
      ];
    }),
    [
      "",
      "",
      "Tools · ★ 4.8 · Free",
      "MUSIC AUDIO · ★ 4.3 · USD 4.99",
      "",
      "",
      "Free",
    ],
    "Malformed legacy metadata is omitted safely; valid ratings and prices still render",
  );
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new DOMException("Clipboard fixture denied", "NotAllowedError");
        },
      },
    });
  });

  const save = page.getByRole("button", {
    name: "Save Notes (Google Play) to your library",
    exact: true,
  });
  await expect(save).toHaveAttribute("aria-pressed", "false");
  await save.click();
  await expect(save).toHaveAttribute("aria-pressed", "true");
  await expect(save).toHaveText("♥ Saved");
  await page.evaluate(() => {
    window.polish.failSave = true;
  });
  await save.click();
  await expect(save).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#toast")).toHaveText("Could not save fixture");
  await expect(
    page.getByRole("button", {
      name: "View Notes on Google Play",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Add Notes (Google Play) to a collection",
      exact: true,
    }),
  ).toBeVisible();

  const share = page.getByRole("button", { name: "Share via", exact: true });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await share.focus();
    await share.click();
    const dialog = page.getByRole("dialog", { name: "Share via", exact: true });
    await expect(dialog).toBeVisible();
    assert.equal(
      await page.evaluate(() => document.documentElement.style.overflow),
      "hidden",
    );
    await expect(
      dialog.getByRole("button", { name: "Close", exact: true }),
    ).toBeFocused();
    const copy = dialog.getByRole("button", { name: "Copy link", exact: true });
    await copy.click();
    const manual = page.getByRole("dialog", {
      name: "Copy link manually",
      exact: true,
    });
    await expect(manual).toBeVisible();
    const input = manual.getByRole("textbox", {
      name: "Link to copy",
      exact: true,
    });
    await expect(input).toHaveValue(
      "https://play.google.com/store/apps/details?id=com.example.notes",
    );
    await expect(input).toHaveAttribute("readonly", "");
    await expect(input).toBeFocused();
    assert.equal(
      await input.evaluate(
        (field) =>
          field.selectionStart === 0 &&
          field.selectionEnd === field.value.length,
      ),
      true,
    );
    assert.match(await manual.innerText(), /Ctrl\+C or ⌘C/);
    assert.match(await manual.innerText(), /touch and hold/);
    await manual
      .getByRole("button", { name: "Select link", exact: true })
      .click();
    await expect(input).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator(".manual-copy-dialog")).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(copy).toBeFocused();
    assert.equal(
      await page.evaluate(() => document.documentElement.style.overflow),
      "hidden",
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("dialog")).toHaveCount(0);
    await expect(share).toBeFocused();
    assert.equal(
      await page.evaluate(() => document.documentElement.style.overflow),
      "",
    );
  }

  const createCard = page.getByRole("button", {
    name: "Create share card",
    exact: false,
  });
  await createCard.click();
  await expect(
    page.getByRole("dialog", { name: "Fixture card", exact: true }),
  ).toBeVisible();
  await expect(createCard).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).toHaveCount(0);
  await expect(createCard).toBeFocused();
  await expect(createCard).not.toHaveAttribute("aria-busy", "true");

  await page.getByText("Make it yours", { exact: true }).click();
  await page
    .getByLabel("QR foreground", { exact: true })
    .selectOption("#173e82");
  await page
    .getByLabel("QR foreground", { exact: true })
    .selectOption("#142e25");
  await page.waitForTimeout(150);
  assert.deepEqual(
    await page
      .locator(".qr-stage canvas")
      .evaluate((canvas) =>
        Array.from(canvas.getContext("2d").getImageData(0, 0, 1, 1).data),
      ),
    [20, 46, 37, 255],
    "An older QR render must not overwrite the latest customization",
  );

  const png = page.getByRole("button", { name: "↓ PNG", exact: true });
  await page.evaluate(() => {
    window.polish.failNext = true;
  });
  await page.getByLabel("Export size", { exact: true }).selectOption("2048");
  const retry = page.getByRole("button", {
    name: "Retry QR code",
    exact: true,
  });
  await expect(retry).toBeVisible();
  await expect(png).toBeDisabled();
  await expect(page.locator(".qr-stage canvas")).toBeHidden();
  await retry.click();
  await expect(png).toBeEnabled();
  await expect(retry).toBeHidden();
  await expect(page.locator(".qr-stage canvas")).toBeVisible();
  await png.click();
  await page.evaluate(() => {
    const png = [...document.querySelectorAll(".qr-panel button")].find(
      (control) => control.textContent === "↓ PNG",
    );
    png.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await expect(png).toBeEnabled();
  assert.equal(await page.evaluate(() => window.polish.exports.length), 1);

  const smart = page.getByRole("button", {
    name: "Create smart link",
    exact: true,
  });
  await smart.click();
  await page.evaluate(() =>
    document
      .querySelector(".smart-button")
      .dispatchEvent(new MouseEvent("click", { bubbles: true })),
  );
  await share.click();
  await page.evaluate(() => window.polish.finishPublish());
  await expect(
    page.getByLabel("Share destination", { exact: true }),
  ).toHaveValue("https://eyubuilds.tech/a/ui-fixture");
  await page
    .getByRole("button", { name: "QR card / PDF", exact: true })
    .click();
  await page.waitForFunction(() => window.polish.cards.length === 2);
  assert.equal(await page.evaluate(() => window.polish.publishes), 1);
  assert.equal(
    await page.evaluate(() => window.polish.cards.at(-1).url),
    "https://play.google.com/store/apps/details?id=com.example.notes",
    "A share dialog and its exported card retain the destination selected when opened",
  );
  assert.deepEqual(errors, []);
  console.log(
    "UI polish passed: legacy metadata, manual clipboard fallback, accessible save states, modal focus and scroll restoration, render failure/retry, latest QR, single-flight export/publish, share snapshot.",
  );
} finally {
  await browser.close();
}
