import { chromium } from "@playwright/test";
import assert from "node:assert/strict";

const site = process.env.PLAYQR_TEST_URL || "http://127.0.0.1:5173/";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const contrast = (foreground, background) => {
  const luminance = (rgb) => {
    const channels = rgb
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map((value) => {
        const c = Number(value) / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const a = luminance(foreground),
    b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    colorScheme: "light",
  });
  await page.route("**/auth/config", (route) =>
    route.fulfill({ json: { enabled: false } }),
  );
  await page.route("**/library", (route) =>
    route.fulfill({ json: { links: [] } }),
  );
  await page.goto(site, { waitUntil: "domcontentloaded" });
  const picker = page.getByLabel("App store", { exact: true });
  await picker.waitFor();
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page
        .getByRole("button", { name: "Switch to dark mode", exact: true })
        .click();
    for (const value of ["all", "android", "ios"]) {
      await picker.selectOption(value);
      const styles = await picker.evaluate((select) => ({
        scheme: getComputedStyle(select).colorScheme,
        options: [...select.options].map((option) => ({
          text: option.textContent,
          color: getComputedStyle(option).color,
          background: getComputedStyle(option).backgroundColor,
          selected: option.selected,
        })),
      }));
      assert.equal(styles.scheme, theme);
      assert.equal(await picker.inputValue(), value);
      assert.equal(
        styles.options.filter((option) => option.selected).length,
        1,
      );
      for (const option of styles.options)
        assert.ok(
          contrast(option.color, option.background) >= 4.5,
          `${theme}: ${option.text} must be readable`,
        );
      if (theme === "dark")
        assert.ok(
          styles.options.every(
            (option) => option.background !== "rgb(255, 255, 255)",
          ),
        );
    }
    await picker.focus();
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    assert.equal(
      await picker.inputValue(),
      "android",
      "Native keyboard selection remains available",
    );
  }
  console.log(
    "PASS: all store options and selected states exceed 4.5:1 contrast in both themes; native keyboard selection preserved",
  );
} finally {
  await browser.close();
}

