// Render the exported PDF with pdftoppm first, then verify its printed QR.
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import jsQR from "jsqr";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  const png = await readFile(
    process.argv[2] || "test-results/share-card-pdf.png",
  );
  const pixels = await page.evaluate(
    async (data) => {
      const image = new Image();
      image.src = data;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 512;
      const ctx = canvas.getContext("2d");
      // Read the complete QR including its quiet zone at a bounded test size.
      ctx.drawImage(
        image,
        image.width / 6,
        image.height / 3,
        (image.width * 2) / 3,
        (image.height * 8) / 15,
        0,
        0,
        512,
        512,
      );
      return {
        width: canvas.width,
        height: canvas.height,
        data: Array.from(
          ctx.getImageData(0, 0, canvas.width, canvas.height).data,
        ),
      };
    },
    "data:image/png;base64," + png.toString("base64"),
  );
  assert.equal(
    jsQR(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height)?.data,
    process.argv[3] || "https://eyubuilds.tech/a/fixture1",
  );
  console.log("PASS: PDF-rendered QR scans to the exact destination");
} finally {
  await browser.close();
}
