import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const site = process.env.PLAYQR_TEST_URL || "http://127.0.0.1:5173/";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  await mkdir("test-results", { recursive: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    if (!localStorage.getItem("playqr-library-v2"))
      localStorage.setItem(
        "playqr-library-v2",
        JSON.stringify({
          collections: Array.from({ length: 100 }, (_, i) => ({
            id: "draft-" + i,
            title: "Collection " + i,
            apps: [],
          })),
          theme: "light",
        }),
      );
  });
  await page.route("**/auth/config", (route) =>
    route.fulfill({ json: { enabled: false } }),
  );
  await page.route("**/library", (route) =>
    route.fulfill({ json: { links: [] } }),
  );
  await page.route("https://itunes.apple.com/lookup?**", (route) =>
    route.fulfill({
      json: {
        results: [
          {
            wrapperType: "software",
            trackId: 1232780281,
            trackName: "Navigation test app",
          },
        ],
      },
    }),
  );
  await page.goto(site, { waitUntil: "domcontentloaded" });
  await page.locator(".header nav a[aria-current='page']").waitFor();
  const active = async (hash) => {
    await page
      .locator(`.header nav a[href='${hash}'][aria-current='page']`)
      .waitFor();
    assert.equal(
      await page.locator(".header nav a[aria-current='page']").count(),
      1,
    );
    assert.equal(
      await page
        .locator(".header nav a[aria-current='page']")
        .getAttribute("href"),
      hash,
    );
  };
  await active("#discover");
  assert.equal(await page.locator(".header nav .nav-icon").count(), 4);
  assert.equal(await page.locator("#collection-count").textContent(), "100");
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page
        .getByRole("button", { name: "Switch to dark mode", exact: true })
        .click();
    for (const width of [320, 390, 700, 760, 768, 800, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const layout = await page.locator(".header").evaluate((header) => {
        const nav = header.querySelector("nav"),
          links = [...nav.querySelectorAll("a")];
        const box = (el) => {
          const b = el.getBoundingClientRect();
          return {
            x: b.x,
            y: b.y,
            width: b.width,
            height: b.height,
            right: b.right,
            bottom: b.bottom,
          };
        };
        return {
          header: box(header),
          nav: box(nav),
          links: links.map(box),
          theme: box(header.querySelector("#theme")),
          documentFits: document.documentElement.scrollWidth <= innerWidth,
          navFits: nav.scrollWidth <= nav.clientWidth + 1,
          labelsFit: links.every((a) => a.scrollWidth <= a.clientWidth + 1),
          activeBackground: getComputedStyle(
            nav.querySelector("[aria-current]"),
          ).backgroundColor,
          inactiveBackground: getComputedStyle(links[1]).backgroundColor,
          underline: getComputedStyle(
            nav.querySelector("[aria-current]"),
            "::after",
          ).content,
        };
      });
      assert.ok(
        layout.documentFits && layout.navFits && layout.labelsFit,
        `${width}px ${theme}: navigation must not overflow`,
      );
      assert.ok(
        layout.links.every((link) => link.height >= 44),
        "All tabs have touch-sized targets",
      );
      assert.ok(layout.theme.width >= 44 && layout.theme.height >= 44);
      assert.equal(await page.locator("#theme svg").count(), 2);
      assert.equal(await page.locator("#theme").getAttribute("aria-pressed"), String(theme === "dark"));
      assert.notEqual(layout.activeBackground, layout.inactiveBackground);
      assert.equal(layout.underline, "none", "No detached active underline");
      if (width > 760) {
        assert.ok(layout.header.height <= 84, "Desktop header stays compact");
        const centers = [...layout.links, layout.theme].map(
          (box) => box.y + box.height / 2,
        );
        assert.ok(
          Math.max(...centers) - Math.min(...centers) < 2,
          "Theme control aligns with navigation",
        );
      } else {
        assert.ok(
          layout.header.height <= 140,
          `${width}px ${theme}: header height ${layout.header.height}`,
        );
        assert.ok(layout.nav.y >= layout.theme.bottom);
        assert.ok(
          Math.max(...layout.links.map((b) => b.width)) -
            Math.min(...layout.links.map((b) => b.width)) <=
            1,
        );
      }
      if ([390, 700, 1440].includes(width))
        await page.locator(".header").screenshot({
          path: `test-results/navigation-${width}-${theme}.png`,
        });
    }
  }
  await page.getByRole("link", { name: "Your library", exact: true }).click();
  await active("#dashboard");
  await page.getByRole("link", { name: "Account", exact: true }).click();
  await active("#account");
  await page
    .getByRole("link", { name: "Continue as guest", exact: true })
    .click();
  await active("#discover");
  await page.locator(".header nav a[href='#collections']").click();
  await active("#collections");
  await page.goto(site + "#collection/draft-0", {
    waitUntil: "domcontentloaded",
  });
  await page.getByLabel("Collection title", { exact: true }).waitFor();
  await active("#collections");
  await page.goto(site + "#app/ios:1232780281", {
    waitUntil: "domcontentloaded",
  });
  await page
    .getByRole("heading", { name: "Navigation test app", exact: true })
    .waitFor();
  await active("#discover");
  await page.setViewportSize({ width: 390, height: 900 });
  await page.locator(".header nav a[href='#discover']").focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press("Tab");
  assert.equal(
    await page
      .locator(".header nav a[href='#account']")
      .evaluate(
        (a) =>
          a === document.activeElement &&
          getComputedStyle(a).outlineStyle !== "none",
      ),
    true,
  );
  await page.keyboard.press("Enter");
  await active("#account");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".header nav a[aria-current='page']").waitFor();
  await active("#account");
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: responsive navigation at eight widths in both themes, 100-count badge, aligned/touch-sized controls, route/leaf active states, guest entry, keyboard focus and theme persistence",
  );
} finally {
  await browser.close();
}
