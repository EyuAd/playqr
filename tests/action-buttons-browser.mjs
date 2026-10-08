import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const site = process.env.PLAYQR_TEST_URL || "http://127.0.0.1:5173/";
assert.match(
  site,
  /^http:\/\/(localhost|127\.0\.0\.1):/,
  "Local fixtures only",
);
const code = "0123456789abcdef";
const app = {
  id: "com.example.notes",
  title: "Notes fixture",
  developer: "Example",
  description: "A recent app used only by this regression test.",
};
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  await mkdir("test-results", { recursive: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
    colorScheme: "light",
  });
  const errors = [],
    writes = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (["POST", "PATCH", "DELETE"].includes(request.method()))
      writes.push(request.url());
  });
  await page.addInitScript((fixture) => {
    if (!localStorage.getItem("playqr-library-v2"))
      localStorage.setItem(
        "playqr-library-v2",
        JSON.stringify({ recent: [fixture], theme: "light" }),
      );
  }, app);
  await page.route("https://fonts.googleapis.com/**", (route) =>
    route.fulfill({ contentType: "text/css", body: "" }),
  );
  await page.route("**/auth/config", (route) =>
    route.fulfill({ json: { enabled: false } }),
  );
  await page.route("**/library", (route) =>
    route.fulfill({ json: { links: [] } }),
  );
  await page.route("**/analytics/" + code + "?**", (route) =>
    route.fulfill({
      json: {
        link: { code, title: "Notes share", kind: "app" },
        rows: [],
        range: "7",
      },
    }),
  );
  await page.route("**/links/" + code, (route) =>
    route.fulfill({
      json: { link: { code, title: "Notes share", kind: "app" }, apps: [app] },
    }),
  );

  async function route(hash) {
    await page.goto(site + hash, { waitUntil: "domcontentloaded" });
    await page.locator("main h1").waitFor();
  }
  async function checkButtons(selector, label) {
    // A hash changes before the SPA finishes rendering its destination.
    await page.locator(selector).first().waitFor({ state: "visible" });
    const metrics = await page.locator(selector).evaluateAll((links) => {
      const box = (node) => node.getBoundingClientRect().toJSON();
      return links.map((link) => {
        const styles = getComputedStyle(link);
        const text = link.querySelector(".action-label");
        const icon = link.querySelector("svg");
        return {
          box: box(link),
          label: box(text),
          icon: box(icon),
          font: parseFloat(getComputedStyle(text).fontSize),
          background: styles.backgroundColor,
          borderColor: styles.borderTopColor,
          borderStyle: styles.borderTopStyle,
          borderWidth: parseFloat(styles.borderTopWidth),
          iconHidden: icon.getAttribute("aria-hidden"),
          textFits: text.scrollWidth <= text.clientWidth + 1,
          parentWidth: link.parentElement.clientWidth,
          parentPadding: ["paddingLeft", "paddingRight"].reduce(
            (sum, key) =>
              sum + parseFloat(getComputedStyle(link.parentElement)[key]),
            0,
          ),
        };
      });
    });
    assert.ok(metrics.length, `${label}: buttons are rendered`);
    for (const metric of metrics) {
      assert.ok(metric.box.height >= 44, `${label}: touch-sized button`);
      assert.ok(metric.font >= 14, `${label}: readable label`);
      assert.ok(
        metric.borderWidth >= 1 && metric.borderStyle === "solid",
        `${label}: visible border`,
      );
      assert.ok(
        !["transparent", "rgba(0, 0, 0, 0)"].includes(metric.background),
        `${label}: filled button surface`,
      );
      assert.ok(
        !["transparent", "rgba(0, 0, 0, 0)"].includes(metric.borderColor),
        `${label}: visible border color`,
      );
      assert.equal(
        metric.iconHidden,
        "true",
        `${label}: decorative arrow is hidden from assistive technology`,
      );
      assert.ok(metric.textFits, `${label}: label is not clipped`);
      for (const child of [metric.label, metric.icon]) {
        assert.ok(
          child.width > 0 && child.height > 0,
          `${label}: label and icon stay visible`,
        );
        assert.ok(
          child.x >= metric.box.x - 1 && child.right <= metric.box.right + 1,
          `${label}: label and icon fit horizontally`,
        );
        assert.ok(
          child.y >= metric.box.y - 1 && child.bottom <= metric.box.bottom + 1,
          `${label}: label and icon fit vertically`,
        );
      }
      assert.ok(
        metric.label.right <= metric.icon.x + 1,
        `${label}: label and arrow do not overlap`,
      );
    }
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      `${label}: no horizontal page overflow`,
    );
    return metrics;
  }

  for (const theme of ["light", "dark"]) {
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await route("#discover");
      if ((await page.locator("html").getAttribute("data-theme")) !== theme)
        await page
          .getByRole("button", { name: `Switch to ${theme} mode`, exact: true })
          .click();
      const name = `${width}px ${theme}`;
      const home = await checkButtons(".how .action-link", name + " homepage");
      assert.equal(home.length, 3);
      for (const metric of home)
        assert.ok(
          Math.abs(
            metric.box.width - (metric.parentWidth - metric.parentPadding),
          ) < 2,
          `${name}: homepage CTAs fill their content column`,
        );
      if (width > 760) {
        const bottoms = home.map((metric) => metric.box.bottom);
        assert.ok(
          Math.max(...bottoms) - Math.min(...bottoms) < 2,
          `${name}: desktop CTA bottoms align`,
        );
      }
      const library = page
        .locator(".section-heading .action-link")
        .filter({ hasText: "Your library" });
      assert.equal(await library.getAttribute("href"), "#dashboard");
      await checkButtons(
        ".section-heading .action-link",
        name + " recent library",
      );
      await page
        .locator(".how .action-link")
        .filter({ hasText: "Find an app" })
        .click();
      await expect(page.getByRole("searchbox")).toBeFocused();
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      await expect(page.getByRole("searchbox")).toBeFocused();
      assert.equal(new URL(page.url()).hash, "#discover");

      await page
        .locator(".how .action-link")
        .filter({ hasText: "Build a collection" })
        .click();
      await expect(page).toHaveURL(/#collections$/);
      await page.locator("main h1").waitFor();
      await route("#discover");
      await library.click();
      await expect(page).toHaveURL(/#dashboard$/);
      await checkButtons(
        ".library-account .action-link",
        name + " account entry",
      );
      await page.locator(".library-account .action-link").click();
      await expect(page).toHaveURL(/#account$/);
      await expect(
        page.getByRole("link", { name: "Continue as guest", exact: true }),
      ).toBeVisible();
      await route("#discover");
      await page
        .locator(".how .action-link")
        .filter({ hasText: "Open your library" })
        .click();
      await expect(page).toHaveURL(/#dashboard$/);

      await route("#analytics/" + code);
      await page
        .getByRole("link", { name: "Open share page", exact: true })
        .waitFor();
      await checkButtons(
        ".section-heading .action-link",
        name + " analytics share",
      );
      await page
        .getByRole("link", { name: "Open share page", exact: true })
        .click();
      await expect(page).toHaveURL(new RegExp("#share/" + code + "$"));
      await page
        .getByRole("heading", { name: "Notes share", exact: true })
        .waitFor();
    }
  }
  assert.deepEqual(
    writes,
    [],
    "Action navigation never publishes or modifies data",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: CTA surfaces, text/icon fit, touch sizing, desktop alignment, persistent search focus and collection/library/account/share navigation at four widths in both themes",
  );
} finally {
  await browser.close();
}
