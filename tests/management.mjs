import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const api = process.env.TEST_API || "http://127.0.0.1:8787";
const site = process.env.TEST_SITE || "http://127.0.0.1:5173/";
const owner = crypto.randomUUID().replaceAll("-", "").repeat(2);
const headers = {
  Authorization: "Bearer " + owner,
  "Content-Type": "application/json",
};
const response = await fetch(api + "/links", {
  method: "POST",
  headers,
  body: JSON.stringify({
    kind: "collection",
    title: "Management verification",
    ids: ["com.spotify.music"],
  }),
});
assert.equal(response.status, 201);
const link = await response.json();
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(
    (value) => localStorage.setItem("playqr-owner", value),
    owner,
  );
  await page.goto(site + "#dashboard");
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Revoke link", exact: true })
      .isDisabled(),
    true,
  );
  await page
    .getByRole("textbox", { name: "Published link title" })
    .fill("Renamed verification");
  await page.getByRole("button", { name: "Save title", exact: true }).click();
  await page
    .getByRole("link", { name: "Renamed verification", exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.getByRole("link", { name: "Insights ↗" }).click();
  await page
    .getByRole("combobox", { name: "Analytics time range" })
    .selectOption("all");
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "↓ Export CSV" }).click();
  const download = await downloading;
  assert.match(download.suggestedFilename(), /all-time\.csv$/);
  assert.match(
    await readFile(await download.path(), "utf8"),
    /"Link code","Title","Period"/,
  );
  await page.getByRole("button", { name: "Manage link", exact: true }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Revoke link", exact: true }).click();
  await page
    .getByText("Your first share is waiting", { exact: true })
    .waitFor();
  assert.equal(
    (await fetch(link.url, { redirect: "manual", headers: { DNT: "1" } }))
      .status,
    404,
  );
  console.log(
    "PASS: mobile management, rename, CSV download, confirmation and revocation",
  );
} finally {
  await browser.close();
  // Only clean up the isolated verification record created by this test.
  await fetch(api + "/links/" + link.code, { method: "DELETE", headers });
}

