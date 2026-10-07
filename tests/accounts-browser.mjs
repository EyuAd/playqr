import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
let claims = 0;
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
    if (path === "/account/claim") {
      assert.equal(req.headers().authorization, "Bearer " + jwt);
      claims++;
      return respond({ claimed: 0 });
    }
    if (path === "/library") return respond({ links: [] });
    return route.continue();
  });
  return page;
}
try {
  const first = await pageForAccount();
  await first.goto("http://127.0.0.1:5173/#dashboard", { waitUntil: "commit" });
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
  await first.evaluate((draftId) => {
    const guest = JSON.parse(localStorage.getItem("playqr-library-v2"));
    guest.collections = [
      {
        id: draftId,
        title: "Guest alternate draft",
        description: "",
        apps: [],
      },
    ];
    localStorage.setItem("playqr-library-v2", JSON.stringify(guest));
  }, cloud.data.collections[0].id);
  await first.getByRole("link", { name: "Account", exact: true }).click();
  await first
    .getByRole("button", { name: "Import browser library", exact: true })
    .click();
  await first
    .getByRole("status")
    .filter({ hasText: "Browser library imported" })
    .waitFor();
  assert.equal(claims, 1);
  assert.equal(
    cloud.data.collections.length,
    2,
    "Guest and account drafts with the same ID are both preserved",
  );
  assert.notEqual(cloud.data.collections[0].id, cloud.data.collections[1].id);
  assert.equal(cloud.data.collections[1].title, "Guest alternate draft");
  const second = await pageForAccount();
  await second.goto("http://127.0.0.1:5173/#collections", {
    waitUntil: "commit",
  });
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
  await first.evaluate(() => {
    const guest = JSON.parse(localStorage.getItem("playqr-library-v2"));
    guest.favorites.push({
      id: "com.guest.new",
      title: "Unimported new guest save",
    });
    localStorage.setItem("playqr-library-v2", JSON.stringify(guest));
  });
  const backupDownload = first.waitForEvent("download");
  await first
    .getByRole("button", { name: "Export library backup", exact: true })
    .click();
  const backup = JSON.parse(
    await readFile(await (await backupDownload).path(), "utf8"),
  );
  assert.equal(backup.format, "playqr-library");
  assert.equal(backup.library.favorites[0].title, "Account-only favorite");
  assert.equal(backup.library.collections[0].title, "Synced draft");
  assert.equal(
    JSON.stringify(backup).includes(jwt),
    false,
    "Backups never contain account credentials",
  );
  assert.equal(
    JSON.stringify(backup).includes("Unimported new guest save"),
    false,
    "Account exports never include the separate guest library",
  );
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
  for (const theme of ["light", "dark"]) {
    if ((await first.locator("html").getAttribute("data-theme")) !== theme)
      await first
        .getByRole("button", { name: `Switch to ${theme} mode`, exact: true })
        .click();
    for (const width of [320, 390, 430, 768, 850, 851, 1024, 1440, 1920]) {
      await first.setViewportSize({ width, height: 900 });
      const layout = await first.evaluate(() => {
        const box = (node) => node.getBoundingClientRect().toJSON();
        const workspace = document.querySelector(".account-workspace");
        return {
          fits: document.documentElement.scrollWidth <= innerWidth,
          workspace: box(workspace),
          panels: [...workspace.children].map(box),
          controls: [
            ...workspace.querySelectorAll("input, textarea, button"),
          ].map(box),
          inputFonts: [...workspace.querySelectorAll("input, textarea")].map(
            (n) => parseFloat(getComputedStyle(n).fontSize),
          ),
        };
      });
      assert.ok(
        layout.fits,
        `${width}px ${theme}: no horizontal page overflow`,
      );
      assert.equal(layout.panels.length, 2);
      assert.ok(
        Math.abs(layout.workspace.x - (width - layout.workspace.right)) < 2,
        "Account workspace is centered",
      );
      for (const box of layout.controls) {
        assert.ok(
          box.width > 0 && box.height >= 44,
          "Controls remain usable and touch-sized",
        );
        assert.ok(
          box.x >= layout.workspace.x && box.right <= layout.workspace.right,
          "Controls stay inside the account workspace",
        );
      }
      assert.ok(
        layout.inputFonts.every((size) => size >= 16),
        "Inputs avoid iPhone focus zoom",
      );
      const [profile, membership] = layout.panels;
      if (width > 850) {
        assert.ok(Math.abs(profile.y - membership.y) < 1);
        assert.ok(
          Math.abs(profile.height - membership.height) < 1,
          "Desktop panels share one aligned surface",
        );
        assert.ok(profile.right <= membership.x + 1);
      } else {
        assert.ok(
          profile.bottom <= membership.y + 1,
          "Phone panels stack without overlap",
        );
        assert.ok(Math.abs(profile.width - membership.width) < 1);
      }
      if ([390, 1440].includes(width))
        await first.screenshot({
          path: `test-results/account-workspace-${width}-${theme}.png`,
          fullPage: true,
        });
    }
  }
  await first.setViewportSize({ width: 320, height: 740 });
  await displayName.fill(
    "A very long display name that should never push the account layout off the screen",
  );
  assert.equal(
    await first.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
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
