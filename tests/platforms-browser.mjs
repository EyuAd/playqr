import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const api = process.env.TEST_API || "http://127.0.0.1:8787";
const site = process.env.TEST_SITE || "http://127.0.0.1:5173/";
const owner = crypto.randomUUID().replaceAll("-", "").repeat(2);
const headers = {
  Authorization: "Bearer " + owner,
  "Content-Type": "application/json",
};
const browser = await chromium.launch({ channel: "chrome", headless: true });
const created = [];
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(45000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(
    (key) => localStorage.setItem("playqr-owner", key),
    owner,
  );
  await page.goto(site);
  await page
    .getByRole("combobox", { name: "App store", exact: true })
    .selectOption("ios");
  await page
    .getByRole("searchbox", { name: "App name or store URL" })
    .fill("Spotify");
  await page.getByRole("button", { name: /Find app/ }).click();
  await page.locator(".app-card").first().waitFor();
  assert.ok((await page.locator(".app-card").count()) > 0);
  assert.equal(
    await page.locator(".platform-badge").first().textContent(),
    "App Store",
  );
  await page.locator(".app-open").first().click();
  await page
    .getByRole("link", { name: "Open App Store ↗", exact: true })
    .waitFor();
  await page
    .getByText("Connect an Android / iPhone version", { exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Matching app store link" })
    .fill("https://play.google.com/store/apps/details?id=com.spotify.music");
  await page
    .getByRole("button", { name: "Check matching app", exact: true })
    .click();
  await page.locator(".pair-preview").waitFor();
  await page.getByRole("checkbox", { name: /I checked the name/ }).check();
  const pairingResponse = page.waitForResponse(
    (r) => r.url() === api + "/links" && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Create smart link", exact: true })
    .click();
  const pair = await (await pairingResponse).json();
  assert.ok(pair.code);
  created.push(pair.code);
  for (const [ua, expected] of [
    ["iPhone", "https://apps.apple.com/us/app/id324684580"],
    [
      "Android",
      "https://play.google.com/store/apps/details?id=com.spotify.music",
    ],
  ]) {
    const response = await fetch(pair.url, {
      redirect: "manual",
      headers: { "User-Agent": ua, DNT: "1" },
    });
    assert.equal(response.headers.get("location"), expected);
  }
  const col = await (
    await fetch(api + "/links", {
      method: "POST",
      headers,
      body: JSON.stringify({
        kind: "collection",
        title: "Travel light",
        description: "A thoughtful travel toolkit.",
        ids: ["ios:324684580", "com.spotify.music"],
        cover: "sunset",
        category: "Travel",
        notes: { "ios:324684580": "Music for the journey." },
      }),
    })
  ).json();
  assert.ok(col.code);
  created.push(col.code);
  await page.goto(site + "#share/" + col.code);
  await page
    .getByRole("button", { name: "Save a copy to my collections" })
    .waitFor();
  assert.equal(await page.locator(".cover-sunset").count(), 1);
  await page.getByText("Music for the journey.", { exact: false }).waitFor();
  await page
    .getByRole("button", { name: "Save a copy to my collections" })
    .click();
  await page
    .getByRole("textbox", { name: "Collection title", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("textbox", { name: "Collection title", exact: true })
      .inputValue(),
    "Travel light",
  );
  await page
    .getByRole("combobox", { name: "Collection cover" })
    .selectOption("cobalt");
  await page
    .getByRole("textbox", {
      name: "Why you recommend Spotify: Music and Podcasts",
    })
    .first()
    .fill("My edited recommendation.");
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  assert.ok(
    (await page.locator(".app-note").first().boundingBox()).width >= 180,
  );
  await page
    .getByRole("textbox", { name: "Collection title", exact: true })
    .focus();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/platforms-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /Switch to dark mode/ }).click();
  await page.screenshot({
    path: "test-results/platforms-mobile-dark.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(site + "#share/" + col.code);
  await page
    .getByRole("button", { name: "Save a copy to my collections" })
    .waitFor();
  await page.screenshot({
    path: "test-results/platforms-desktop.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: live Apple search, original icon URL, confirmed pairing, device redirects, mixed collection presentation, remix, mobile and desktop layouts",
  );
} finally {
  await browser.close();
  for (const code of created)
    await fetch(api + "/links/" + code, { method: "DELETE", headers });
}
