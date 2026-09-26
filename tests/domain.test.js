import test from "node:test";
import assert from "node:assert/strict";
import {
  parsePlayUrl,
  playUrl,
  validId,
  smartDestination,
  validateCollection,
  validateQR,
  imageUrl,
} from "../shared/domain.js";
import { extractApp } from "../worker/metadata.js";
import QRCode from "qrcode";
import jsQR from "jsqr";

test("Play URL normalization discards tracking parameters", () => {
  assert.deepEqual(
    parsePlayUrl(
      "https://play.google.com/store/apps/details?id=com.spotify.music&hl=en",
    ),
    { id: "com.spotify.music", url: playUrl("com.spotify.music") },
  );
});
test("Play URL validation rejects hostile and ambiguous destinations", () => {
  for (const url of [
    "https://play.google.com.evil.test/store/apps/details?id=com.app",
    "javascript:alert(1)",
    "http://play.google.com/store/apps/details?id=com.app",
    "https://user@play.google.com/store/apps/details?id=com.app",
    "https://play.google.com/store/apps/details?id=com.app&id=com.other",
    "https://play.google.com/store/search?q=pubg",
    "https://play.google.com/store/apps/details?id=../bad",
  ])
    assert.equal(parsePlayUrl(url), null, url);
  assert.equal(validId("com.example_app.android"), true);
  assert.equal(validId("com.app/<script>"), false);
});
test("smart redirects use canonical Play URLs only for Android single apps", () => {
  const link = {
      kind: "app",
      ids: ["com.spotify.music"],
      code: "abcdef1234567890",
    },
    site = "https://example.com/";
  assert.equal(
    smartDestination(link, "Mozilla Android", site),
    playUrl(link.ids[0]),
  );
  for (const ua of ["iPhone Safari", "iPad", "Windows Chrome", ""])
    assert.equal(
      smartDestination(link, ua, site),
      site + "#share/" + link.code,
    );
  assert.equal(
    smartDestination({ ...link, kind: "collection" }, "Android", site),
    site + "#share/" + link.code,
  );
});
test("collections trim metadata, deduplicate and reject invalid sizes/IDs", () => {
  assert.deepEqual(
    validateCollection({ title: " Team ", ids: ["com.app", "com.app"] }),
    { title: "Team", description: "", ids: ["com.app"] },
  );
  for (const value of [
    { title: "", ids: ["com.app"] },
    { title: "Team", ids: [] },
    { title: "Team", ids: ["bad"] },
    { title: "Team", ids: Array(21).fill("com.app") },
  ])
    assert.throws(() => validateCollection(value));
});
test("metadata reads structured app data without combining unrelated text", () => {
  const app = extractApp(
    [
      {
        "@graph": [
          {
            "@type": "SoftwareApplication",
            name: "App name",
            author: { name: "Developer" },
            image: "https://play-lh.googleusercontent.com/icon",
            aggregateRating: { ratingValue: "4.6", ratingCount: "120" },
            offers: { price: 0, priceCurrency: "USD" },
            description: "Description",
          },
        ],
      },
    ],
    "com.app",
  );
  assert.equal(app.title, "App name");
  assert.equal(app.developer, "Developer");
  assert.equal(app.rating, 4.6);
  assert.equal(app.price, "0");
  assert.equal(app.reviews, 120);
  assert.equal(imageUrl("https://evil.test/icon"), "");
  assert.equal(
    extractApp([], "com.app", { title: "Fallback - Apps on Google Play" })
      .title,
    "Fallback",
  );
});
test("QR inputs reject insecure payloads and constrain colors and sizes", () => {
  for (const url of [
    "javascript:alert(1)",
    "http://evil.test",
    "data:text/html,bad",
    "https://example.com/" + "x".repeat(2048),
  ])
    assert.throws(() => validateQR(url));
  assert.deepEqual(
    validateQR("https://example.com", { color: "#ffffff", size: 1 }),
    { color: "#142e25", size: 1024, background: "#ffffff" },
  );
});
test("all supported QR palettes decode to the exact app destination", () => {
  const url = playUrl("com.spotify.music");
  for (const color of ["#142e25", "#121826", "#173e82"])
    for (const background of ["white", "cream"]) {
      const o = validateQR(url, { color, background }),
        qr = QRCode.create(url, { errorCorrectionLevel: "H" }),
        scale = 8,
        margin = 4,
        width = (qr.modules.size + margin * 2) * scale,
        pixels = new Uint8ClampedArray(width * width * 4);
      const rgb = (hex) =>
          [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)),
        dark = rgb(o.color),
        light = rgb(o.background);
      for (let y = 0; y < width; y++)
        for (let x = 0; x < width; x++) {
          const r = Math.floor(y / scale) - margin,
            c = Math.floor(x / scale) - margin,
            on =
              r >= 0 &&
              c >= 0 &&
              r < qr.modules.size &&
              c < qr.modules.size &&
              qr.modules.get(r, c);
          pixels.set([...(on ? dark : light), 255], (y * width + x) * 4);
        }
      assert.equal(jsQR(pixels, width, width)?.data, url);
    }
});

