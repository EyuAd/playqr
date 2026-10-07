import { chromium } from "@playwright/test";
import assert from "node:assert/strict";

const site = process.env.PLAYQR_TEST_URL || "http://127.0.0.1:5173/";
assert.match(
  site,
  /^http:\/\/(localhost|127\.0\.0\.1):/,
  "Local fixtures only",
);
const uid = "11111111-1111-4111-8111-111111111111";
const user = {
  id: uid,
  email: "fixture@example.com",
  aud: "authenticated",
  role: "authenticated",
  email_confirmed_at: "2026-10-02T00:00:00Z",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-10-02T00:00:00Z",
};
const jwt =
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ) +
  "." +
  Buffer.from(
    JSON.stringify({ sub: uid, exp: Math.floor(Date.now() / 1000) + 3600 }),
  ).toString("base64url") +
  ".fixture";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  const modules = {};
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path === "/src/storage.js" || path === "/src/sync.js")
      modules[path.endsWith("storage.js") ? "storage" : "sync"] ||=
        request.url();
  });
  await context.addInitScript(
    ({ user, jwt }) => {
      if (!localStorage.getItem("sb-fixture-auth-token"))
        localStorage.setItem(
          "sb-fixture-auth-token",
          JSON.stringify({
            access_token: jwt,
            refresh_token: "fixture-refresh",
            token_type: "bearer",
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user,
          }),
        );
    },
    { user, jwt },
  );
  await context.route("https://fixture.supabase.co/**", (route) =>
    route.fulfill({ json: user }),
  );
  await context.route("**/auth/config", (route) =>
    route.fulfill({
      json: {
        enabled: true,
        url: "https://fixture.supabase.co",
        publishableKey: "sb_publishable_fixture",
      },
    }),
  );
  const cloud = { revision: 1, data: { favorites: [], collections: [] } };
  let posts = 0;
  let release = null;
  let observed = null;
  let failAfterPost = false;
  let restoreStalled = false;
  await context.route("**/account/library", async (route) => {
    if (route.request().method() === "GET") {
      if (restoreStalled) return;
      return route.fulfill({ json: cloud });
    }
    posts++;
    const input = route.request().postDataJSON();
    assert.equal(input.revision, cloud.revision);
    if (observed) {
      observed();
      observed = null;
      await new Promise((resolve) => (release = resolve));
    }
    cloud.data = input.data;
    cloud.revision++;
    if (failAfterPost) {
      failAfterPost = false;
      await page.evaluate(() => (window.__denyCheckpoint = true));
    }
    return route.fulfill({ json: { revision: cloud.revision } });
  });
  await context.route("**/account/profile", (route) =>
    route.fulfill({ json: { profile: null } }),
  );
  await context.route(
    (url) => url.pathname === "/library",
    (route) => route.fulfill({ json: { links: [] } }),
  );
  await page.goto(site + "#account", { waitUntil: "commit" });
  await page.getByText("Library is up to date", { exact: true }).waitFor();
  await page.evaluate(() => {
    window.__originalSetItem = Storage.prototype.setItem;
    window.__denyCheckpoint = true;
    Storage.prototype.setItem = function (key, value) {
      if (window.__denyCheckpoint && key.startsWith("playqr-sync:"))
        throw new DOMException("Storage full", "QuotaExceededError");
      return window.__originalSetItem.call(this, key, value);
    };
  });
  const paused = await page.evaluate(async (modules) => {
    const storage = await import(modules.storage);
    const sync = await import(modules.sync);
    storage.favorite({ id: "com.first.app", title: "First" });
    await sync.flush();
    return sync.syncStatus;
  }, modules);
  assert.match(paused, /^Sync paused: Browser storage/);
  assert.equal(posts, 0, "No cloud write without a recoverable checkpoint");
  const recovered = await page.evaluate(async (modules) => {
    window.__denyCheckpoint = false;
    const sync = await import(modules.sync);
    await sync.flush();
    return sync.syncStatus;
  }, modules);
  assert.equal(recovered, "Saved to your account");
  assert.equal(
    posts,
    1,
    "A failed checkpoint must not leave a stuck running lock",
  );

  // A checkpoint failure after a successful server write must also be retryable.
  failAfterPost = true;
  const postPaused = await page.evaluate(async (modules) => {
    const storage = await import(modules.storage);
    const sync = await import(modules.sync);
    storage.favorite({ id: "com.second.app", title: "Second" });
    await sync.flush();
    return sync.syncStatus;
  }, modules);
  assert.match(postPaused, /^Sync paused: Browser storage/);
  const postRecovered = await page.evaluate(async (modules) => {
    window.__denyCheckpoint = false;
    const sync = await import(modules.sync);
    await sync.flush();
    return sync.syncStatus;
  }, modules);
  assert.equal(postRecovered, "Saved to your account");
  assert.equal(posts, 3);

  // Finish a cloud write only after a second tab has stored a newer local copy.
  const requestObserved = new Promise((resolve) => (observed = resolve));
  await page.evaluate(async (modules) => {
    const storage = await import(modules.storage);
    const sync = await import(modules.sync);
    storage.favorite({ id: "com.third.app", title: "Third" });
    window.__firstFlush = sync.flush();
    window.__secondFlushDone = false;
    window.__secondFlush = sync.flush().then(() => {
      window.__secondFlushDone = true;
    });
  }, modules);
  await requestObserved;
  assert.equal(
    await page.evaluate(() => window.__secondFlushDone),
    false,
    "Concurrent callers await the actual active write",
  );
  await context.route("**/storage-fixture", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Fixture</title>",
    }),
  );
  const other = await context.newPage();
  await other.goto(site + "storage-fixture");
  const newer = JSON.stringify({
    favorites: [{ id: "com.other.app", title: "Other tab's saved copy" }],
    collections: [],
    recent: [],
    searches: [],
    shares: [],
    theme: "system",
  });
  await other.evaluate(
    ({ uid, newer }) => localStorage.setItem("playqr-library-v3:" + uid, newer),
    { uid, newer },
  );
  await page
    .getByText(/Sync conflict: your library changed in another tab/)
    .waitFor();
  release();
  const conflict = await page.evaluate(async (modules) => {
    await window.__firstFlush;
    await window.__secondFlush;
    const sync = await import(modules.sync);
    await sync.flush();
    return sync.syncStatus;
  }, modules);
  assert.match(conflict, /^Sync conflict:/);
  assert.equal(posts, 4, "Stale-tab retries never overwrite the newer copy");
  assert.equal(
    await page.evaluate(
      (uid) => localStorage.getItem("playqr-library-v3:" + uid),
      uid,
    ),
    newer,
  );
  assert.equal(
    await page.evaluate(
      (uid) => JSON.parse(localStorage.getItem("playqr-sync:" + uid)).pending,
      uid,
    ),
    true,
    "Finishing stale writes must not clear the newer tab's pending checkpoint",
  );
  restoreStalled = true;
  const started = Date.now();
  const timedOut = await page.evaluate(async (modules) => {
    const sync = await import(modules.sync);
    await sync.initializeWorkspace();
    return sync.syncStatus;
  }, modules);
  assert.match(timedOut, /^Sync paused: Cloud restore took too long/);
  assert.ok(Date.now() - started >= 9000 && Date.now() - started < 20000);
  assert.equal(
    await page.evaluate(
      (uid) => localStorage.getItem("playqr-library-v3:" + uid),
      uid,
    ),
    newer,
    "A timed-out restore preserves the current account's browser library",
  );
  assert.equal(
    posts,
    4,
    "A timed-out restore does not write a revision-zero copy",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: checkpoint failures retry, concurrent flush callers wait, and in-flight cross-tab writes preserve the newer local library",
  );
} finally {
  await browser.close();
}
