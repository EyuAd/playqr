import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const site = process.env.PLAYQR_TEST_URL || "http://127.0.0.1:5173/";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const guest = {
  favorites: [{ id: "com.guest.app", title: "Guest-only favorite" }],
  collections: [],
};
try {
  await mkdir("test-results", { recursive: true });
  for (const enabled of [false, true]) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    const errors = [],
      authRequests = [],
      cloudRequests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript((library) => {
      if (!localStorage.getItem("playqr-library-v2"))
        localStorage.setItem("playqr-library-v2", JSON.stringify(library));
    }, guest);
    await page.route("**/auth/config", (route) =>
      route.fulfill({
        json: enabled
          ? {
              enabled: true,
              url: "https://fixture.supabase.co",
              publishableKey: "sb_publishable_fixture",
            }
          : { enabled: false },
      }),
    );
    await page.route("https://fixture.supabase.co/**", (route) => {
      authRequests.push(route.request().url());
      return route.fulfill({
        status: 400,
        json: { error: "Unexpected auth request" },
      });
    });
    await page.route("**/account/**", (route) => {
      cloudRequests.push(route.request().url());
      return route.fulfill({ status: 401, json: { error: "Not signed in" } });
    });
    await page.route("**/library", (route) =>
      route.fulfill({ json: { links: [] } }),
    );
    await page.goto(site + "#account", { waitUntil: "domcontentloaded" });
    const choice = page.getByRole("link", {
      name: "Continue as guest",
      exact: true,
    });
    await choice.waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Continue with Google", exact: true })
        .count(),
      enabled ? 1 : 0,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Email me a sign-in link", exact: true })
        .count(),
      enabled ? 1 : 0,
    );
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      if (enabled) {
        const card = await page.locator(".signin-card").boundingBox();
        assert.ok(card.width <= 480, "Sign-in card must stay compact");
        assert.equal(await page.locator(".google-mark svg").count(), 1);
      }
    }
    await page.screenshot({
      path: `test-results/guest-${enabled ? "enabled" : "disabled"}-desktop.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: `test-results/guest-${enabled ? "enabled" : "disabled"}-mobile.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Switch to dark mode" }).click();
    await page.screenshot({
      path: `test-results/guest-${enabled ? "enabled" : "disabled"}-dark.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({
      path: `test-results/guest-${enabled ? "enabled" : "disabled"}-desktop-dark.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    // Empty required email input must not block the guest action.
    await choice.click();
    await page.waitForURL("**/#discover");
    await page.getByRole("link", { name: "Your library", exact: true }).click();
    await page.getByText("Guest-only favorite", { exact: true }).waitFor();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByText("Guest-only favorite", { exact: true }).waitFor();
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("playqr-library-v2")),
    );
    assert.deepEqual(saved.favorites, guest.favorites);
    assert.deepEqual(authRequests, []);
    assert.deepEqual(cloudRequests, []);
    assert.deepEqual(errors, []);
    if (enabled) {
      let emailRequest;
      await page.route("https://fixture.supabase.co/auth/v1/otp**", (route) => {
        emailRequest = route.request().postDataJSON();
        return route.fulfill({ status: 200, json: {} });
      });
      await page.getByRole("link", { name: "Account", exact: true }).click();
      await page
        .getByRole("textbox", { name: "Email address" })
        .fill("test@example.com");
      await page
        .getByRole("button", { name: "Email me a sign-in link", exact: true })
        .click();
      await page
        .getByRole("status")
        .filter({ hasText: "Check your inbox" })
        .waitFor();
      assert.equal(emailRequest.email, "test@example.com");
      assert.ok(emailRequest.code_challenge, "Email sign-in must retain PKCE");
    }
    await context.close();
  }
  console.log(
    "PASS: guest entry with auth disabled/enabled, no sign-in or cloud writes, saved library preserved, mobile/desktop layouts",
  );
} finally {
  await browser.close();
}

