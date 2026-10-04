import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const uid = "11111111-1111-4111-8111-111111111111";
const jwt =
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ) +
  "." +
  Buffer.from(
    JSON.stringify({ sub: uid, exp: Math.floor(Date.now() / 1000) + 3600 }),
  ).toString("base64url") +
  ".fixture";
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
const cloud = {
  revision: 1,
  data: {
    favorites: [{ id: "ios:324684580", title: "Account-only favorite" }],
    collections: [],
  },
};
const errors = [];
async function pageForAccount() {
  const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(
    ({ user, jwt }) => {
      if (!localStorage.getItem("test-seeded")) {
        localStorage.setItem("test-seeded", "yes");
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
        localStorage.setItem(
          "playqr-library-v2",
          JSON.stringify({
            favorites: [{ id: "com.guest.app", title: "Guest-only favorite" }],
            collections: [],
          }),
        );
      }
    },
    { user, jwt },
  );
  await page.route("https://fixture.supabase.co/auth/v1/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        route.request().url().includes("/logout") ? {} : user,
      ),
    }),
  );
  await page.route("http://127.0.0.1:8787/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    const respond = (body, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (path === "/auth/config")
      return respond({
        enabled: true,
        url: "https://fixture.supabase.co",
        publishableKey: "sb_publishable_fixture",
      });
    if (path === "/account/library") {
      assert.equal(req.headers().authorization, "Bearer " + jwt);
      if (req.method() === "POST") {
        const next = req.postDataJSON();
        if (next.revision !== cloud.revision)
          return respond(
            {
              error:
                "Your library changed on another device. Reload the cloud copy before saving again.",
            },
            409,
          );
        cloud.data = next.data;
        cloud.revision++;
        return respond({ revision: cloud.revision });
      }
      return respond(cloud);
    }
    if (path === "/account/profile")
      return respond({
        profile: {
          handle: "library-curator",
          name: "Library curator",
          bio: "Good apps, kept together.",
        },
      });
    if (path === "/library") return respond({ links: [] });
    return route.continue();
  });
  return page;
}
try {
  const first = await pageForAccount();
  await first.goto("http://127.0.0.1:5173/#dashboard");
  await first.getByText("Account-only favorite", { exact: true }).waitFor();
  assert.equal(
    await first.getByText("Guest-only favorite", { exact: true }).count(),
    0,
  );
  await first.getByRole("link", { name: /Collections/ }).click();
  await first
    .getByRole("button", { name: "+ New collection", exact: true })
    .click();
  await first
    .getByRole("textbox", { name: "Collection title", exact: true })
    .fill("Synced draft");
  await first.waitForResponse(
    (r) =>
      r.url().endsWith("/account/library") && r.request().method() === "POST",
  );
  assert.equal(cloud.data.collections[0].title, "Synced draft");
  const second = await pageForAccount();
  await second.goto("http://127.0.0.1:5173/#collections");
  await second
    .getByRole("heading", { name: "Synced draft", exact: true })
    .waitFor();
  // Simulate a third device updating the shared revision: stale writes must fail.
  cloud.revision++;
  await second.getByRole("link", { name: /Synced draft/ }).click();
  await second
    .getByRole("textbox", { name: "Collection title", exact: true })
    .fill("Local conflicting edit");
  await second.waitForResponse(
    (r) => r.url().endsWith("/account/library") && r.status() === 409,
  );
  await second.getByRole("link", { name: "Account", exact: true }).click();
  await second.getByText(/Sync conflict:/).waitFor();
  assert.equal(cloud.data.collections[0].title, "Synced draft");
  await second.reload();
  await second.getByText(/Sync conflict:/).waitFor();
  await second.getByRole("link", { name: /Collections/ }).click();
  await second
    .getByRole("heading", { name: "Local conflicting edit", exact: true })
    .waitFor();
  await first.getByRole("link", { name: "Account", exact: true }).click();
  assert.equal(
    await first
      .getByRole("link", { name: "Continue as guest", exact: true })
      .count(),
    0,
  );
  await first
    .getByRole("button", { name: "Save public profile", exact: true })
    .waitFor();
  const displayName = first.getByRole("textbox", {
    name: "Display name",
    exact: true,
  });
  await displayName.fill("Updated preview");
  assert.equal(
    await first.locator(".profile-preview strong").innerText(),
    "Updated preview",
  );
  await first
    .getByRole("textbox", { name: "Profile bio", exact: true })
    .fill("A new bio");
  assert.equal(await first.locator(".field-counter").innerText(), "9/300");
  for (const width of [320, 390, 768, 1440]) {
    await first.setViewportSize({ width, height: 900 });
    assert.equal(
      await first.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    assert.equal(
      await first.locator(".account-workspace > .account-panel").count(),
      2,
    );
  }
  await first.screenshot({
    path: "test-results/account-workspace-desktop.png",
    fullPage: true,
  });
  await first
    .getByRole("button", { name: "Switch to dark mode", exact: true })
    .click();
  await first.screenshot({
    path: "test-results/account-workspace-dark-mobile.png",
    fullPage: true,
  });
  await first.setViewportSize({ width: 1440, height: 900 });
  await first.screenshot({
    path: "test-results/account-workspace-dark-desktop.png",
    fullPage: true,
  });
  await first.setViewportSize({ width: 390, height: 844 });
  await first.screenshot({
    path: "test-results/account-workspace-mobile.png",
    fullPage: true,
  });
  await first.getByRole("button", { name: "Sign out", exact: true }).click();
  await first
    .getByRole("button", { name: "Continue with Google", exact: true })
    .waitFor();
  await first
    .getByRole("link", { name: "Continue as guest", exact: true })
    .click();
  await first.waitForURL("**/#discover");
  await first.getByRole("link", { name: "Your library", exact: true }).click();
  await first.getByText("Guest-only favorite", { exact: true }).waitFor();
  assert.equal(
    await first.getByText("Account-only favorite", { exact: true }).count(),
    0,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: mocked-auth browser integration: cloud restore, auto-save, two-device library sync, persistent conflict protection, sign-out privacy isolation",
  );
} finally {
  await browser.close();
}
