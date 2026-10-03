import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import jsQR from "jsqr";

const site = "http://127.0.0.1:5173/";
const apple = {
  wrapperType: "software",
  trackId: 324684580,
  trackName: "Spotify",
  sellerName: "Spotify AB",
  artworkUrl512: "https://is1-ssl.mzstatic.com/icon.png",
};
const android = {
  id: "com.spotify.music",
  title: "Spotify",
  platform: "android",
};
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  let failApple = false,
    failAndroid = false,
    slowApple = false,
    calls = [];
  await page.route("**/auth/config", (r) =>
    r.fulfill({ json: { enabled: false } }),
  );
  await page.route("**/library", (r) => r.fulfill({ json: { links: [] } }));
  await page.route("https://itunes.apple.com/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    calls.push({
      provider: "apple",
      url: req.url(),
      headers: await req.allHeaders(),
    });
    if (slowApple) await new Promise((resolve) => setTimeout(resolve, 200));
    await route.fulfill({
      status: failApple ? 429 : 200,
      json: {
        results:
          url.searchParams.get("term") === "empty" ||
          url.searchParams.get("id") === "123456789"
            ? []
            : [apple],
      },
    });
  });
  await page.route(/^http:\/\/127\.0\.0\.1:8787\/search\?/, (route) => {
    const url = new URL(route.request().url());
    assert.equal(
      url.searchParams.get("store"),
      "android",
      "Apple search must not depend on the Worker",
    );
    calls.push({ provider: "android", url: url.href });
    return route.fulfill({
      status: failAndroid ? 502 : 200,
      json: failAndroid
        ? { error: "Provider unavailable" }
        : { apps: [android] },
    });
  });
  await page.route(/^http:\/\/127\.0\.0\.1:8787\/app\?/, (route) => {
    calls.push({ provider: "fallback" });
    return route.fulfill({
      json: {
        app: {
          id: "ios:324684580",
          platform: "ios",
          title: "Official listing fallback",
        },
      },
    });
  });
  await page.goto(site, { waitUntil: "domcontentloaded" });
  const search = (query, store) =>
    page.evaluate(
      async ({ query, store }) =>
        (await import("/src/api.js")).search(query, undefined, store),
      { query, store },
    );
  const details = (id) =>
    page.evaluate(
      async (id) => (await import("/src/api.js")).appDetails(id),
      id,
    );
  assert.equal((await search("spotify", "ios")).apps[0].id, "ios:324684580");
  assert.equal(calls.length, 1);
  const initial = calls[0];
  assert.equal(new URL(initial.url).searchParams.get("media"), "software");
  for (const header of ["authorization", "cookie", "referer"])
    assert.equal(initial.headers[header], undefined);
  await search("spotify", "ios");
  assert.equal(calls.length, 1, "Successful results use the browser cache");
  assert.deepEqual(
    (await search("mixed", "all")).apps.map((a) => a.id),
    ["com.spotify.music", "ios:324684580"],
  );
  failApple = true;
  let result = await search("apple-down", "all");
  assert.deepEqual(
    result.apps.map((a) => a.id),
    ["com.spotify.music"],
  );
  assert.match(result.warning, /App Store is temporarily unavailable/);
  failApple = false;
  assert.equal(
    (await search("apple-down", "all")).apps.length,
    2,
    "Partial failures must not be cached",
  );
  failAndroid = true;
  result = await search("android-down", "all");
  assert.deepEqual(
    result.apps.map((a) => a.id),
    ["ios:324684580"],
  );
  assert.match(result.warning, /Google Play is temporarily unavailable/);
  failApple = true;
  await assert.rejects(search("both-down", "all"), /Both stores/);
  await assert.rejects(search("apple-error", "ios"), /too many requests/);
  assert.equal(
    (await details("ios:324684580")).app.title,
    "Official listing fallback",
  );
  await assert.rejects(details("bad-id"), /Invalid app ID/);
  failApple = false;
  assert.deepEqual((await search("empty", "ios")).apps, []);
  const fallbackCalls = calls.filter((c) => c.provider === "fallback").length;
  await assert.rejects(details("ios:123456789"), /not available/);
  assert.equal(
    calls.filter((c) => c.provider === "fallback").length,
    fallbackCalls,
    "Real 404s do not trigger backend retries",
  );
  failAndroid = false;
  slowApple = true;
  assert.equal(
    await page.evaluate(async () => {
      const api = await import("/src/api.js"),
        controller = new AbortController();
      const request = api.search("cancelled", controller.signal, "all");
      controller.abort();
      try {
        await request;
        return "unexpected";
      } catch (error) {
        return error.name;
      }
    }),
    "AbortError",
  );
  console.log(
    "PASS: credential-free direct Apple requests, cache, mixed/partial results, recoverable failures, exact lookup/fallback, empty results and cancellation",
  );

  // Real upstream request from an isolated guest browser: no fixture app metadata.
  const live = await browser.newPage({ viewport: { width: 390, height: 844 } });
  live.setDefaultTimeout(45000);
  const errors = [];
  live.on("pageerror", (error) => errors.push(error.message));
  await live.route("**/auth/config", (r) =>
    r.fulfill({ json: { enabled: false } }),
  );
  await live.route("**/library", (r) => r.fulfill({ json: { links: [] } }));
  await live.goto(site, { waitUntil: "domcontentloaded" });
  await live.getByLabel("App store", { exact: true }).selectOption("ios");
  await live.getByRole("searchbox").fill("Spotify");
  await live.getByRole("button", { name: "Find app", exact: true }).click();
  const card = live.locator(".search-results .app-card").first();
  await card.waitFor();
  assert.match(await card.innerText(), /Spotify/);
  await card.locator("img").evaluate((image) => image.decode());
  assert.ok(
    await card.locator("img").evaluate((image) => image.naturalWidth > 0),
  );
  await live.screenshot({
    path: "test-results/apple-search-mobile.png",
    fullPage: true,
  });
  await card.locator(".app-open").click();
  await live.locator(".qr-stage canvas").waitFor();
  const destination = await live.getByLabel("Share destination").inputValue();
  assert.equal(destination, "https://apps.apple.com/us/app/id324684580");
  const pixels = await live
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
  assert.equal(
    await live.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await live.screenshot({
    path: "test-results/apple-app-mobile.png",
    fullPage: true,
  });
  await live.reload({ waitUntil: "domcontentloaded" });
  await live
    .getByRole("link", { name: "Open App Store ↗", exact: true })
    .waitFor();
  await live
    .locator(".app-detail img")
    .first()
    .evaluate((image) => image.decode());
  assert.deepEqual(errors, []);
  console.log(
    "PASS: real browser Apple search/CORS, original loaded icon, exact-app QR decoded, mobile layout and reload lookup",
  );
} finally {
  await browser.close();
}

