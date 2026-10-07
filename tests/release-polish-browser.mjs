import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";

const site = process.env.PLAYQR_TEST_URL || "http://127.0.0.1:5173/";
const app = {
  id: "com.example.alpha",
  title: "Alpha Notes",
  developer: "Example",
  description: "A focused notes app.",
  rating: 4.5,
  price: "0",
};
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://fonts.googleapis.com/**", (route) =>
    route.fulfill({ contentType: "text/css", body: "" }),
  );
  await page.route("**/auth/config", (route) =>
    route.fulfill({ json: { enabled: false } }),
  );
  await page.route("**/library", (route) =>
    route.fulfill({ json: { links: [] } }),
  );
  await page.route(/\/app\?/, (route) => route.fulfill({ json: { app } }));
  let publishRequests = 0,
    finishPublish;
  await page.route("**/links", async (route) => {
    if (route.request().method() !== "POST")
      return route.fulfill({ json: { links: [] } });
    publishRequests++;
    await new Promise((resolve) => {
      finishPublish = async () => {
        await route.fulfill({
          json: { code: "fixture1", url: site + "#share/fixture1" },
        });
        resolve();
      };
    });
  });
  await page.goto(site + "#app/" + app.id, { waitUntil: "commit" });
  await page.getByRole("heading", { name: app.title, exact: true }).waitFor();
  const save = page.getByRole("button", { name: /Save Alpha Notes/ });
  await save.click();
  await expect(save).toHaveAttribute("aria-pressed", "true");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("button", { name: /Save Alpha Notes/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "+ Collection", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Add to collection",
    exact: true,
  });
  await dialog
    .getByRole("textbox", { name: "New collection title", exact: true })
    .fill("Keyboard collection");
  await dialog
    .getByRole("textbox", { name: "New collection title", exact: true })
    .press("Enter");
  await expect(dialog).toHaveCount(0);
  const drafts = await page.evaluate(
    () => JSON.parse(localStorage.getItem("playqr-library-v2")).collections,
  );
  assert.equal(drafts[0].title, "Keyboard collection");
  assert.equal(drafts[0].apps[0].id, app.id);
  await page.getByRole("link", { name: /Collections/, exact: false }).click();
  await expect(page).toHaveTitle(/A setup worth sharing.*PlayQR/);
  assert.equal(await page.evaluate(() => document.activeElement.id), "main");
  await page.getByRole("link", { name: /Keyboard collection/ }).click();
  const publish = page.getByRole("button", {
    name: "Publish collection ↗",
    exact: true,
  });
  await publish.click();
  const pendingPublish = page.getByRole("button", {
    name: "Publishing…",
    exact: true,
  });
  await expect(pendingPublish).toBeDisabled();
  await expect.poll(() => publishRequests).toBe(1);
  await pendingPublish.dispatchEvent("click");
  assert.equal(
    publishRequests,
    1,
    "Double clicks cannot create duplicate public links",
  );
  await page.getByRole("link", { name: "Account", exact: true }).click();
  await finishPublish();
  await expect(page).toHaveURL(/#account$/);
  assert.equal(await page.locator("#main").getAttribute("aria-busy"), "false");
  await page.goto(
    site +
      "?error=access_denied&error_code=otp_expired&error_description=untrusted#account",
    { waitUntil: "commit" },
  );
  await page.getByText(/That sign-in link has expired/).waitFor();
  assert.equal(new URL(page.url()).searchParams.has("error"), false);
  assert.equal(
    new URL(page.url()).searchParams.has("error_description"),
    false,
  );
  await page.route("**/unreadable", (route) =>
    route.fulfill({
      status: 502,
      contentType: "text/html",
      body: "<h1>Bad Gateway</h1>",
    }),
  );
  const failure = await page.evaluate(async () => {
    const { request } = await import("/src/api.js");
    try {
      await request("/unreadable");
    } catch (error) {
      return { message: error.message, status: error.status };
    }
  });
  assert.equal(failure.status, 502);
  assert.match(failure.message, /unreadable response/);
  await page.route("**/rate-limited", (route) =>
    route.fulfill({ status: 429, json: {} }),
  );
  const rateLimit = await page.evaluate(async () => {
    const { request } = await import("/src/api.js");
    try {
      await request("/rate-limited");
    } catch (error) {
      return error.message;
    }
  });
  assert.match(rateLimit, /Too many requests/);
  await page
    .getByRole("link", { name: "Continue as guest", exact: true })
    .click();
  await page.getByRole("link", { name: /Collections/ }).click();
  await page.getByRole("link", { name: /Keyboard collection/ }).click();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("playqr-library"))
        throw new DOMException("Full", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page
    .getByRole("textbox", { name: "Collection title", exact: true })
    .fill("Unsaved changes");
  await page.getByText(/Not saved\./).waitFor();
  await expect(
    page.getByRole("button", { name: "Retry saving", exact: true }),
  ).toBeVisible();
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("playqr-library-v2")).collections[0]
          .title,
    ),
    "Keyboard collection",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: persisted save state, Enter-to-create, route focus/titles, publish lock/stale navigation, expired-link recovery, API errors, visible draft save failure",
  );
} finally {
  await browser.close();
}
