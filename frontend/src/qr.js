import QRCode from "qrcode";
import { validateQR } from "../../shared/domain.js";
export async function renderQR(canvas, value, settings = {}) {
  const o = validateQR(value, settings);
  await QRCode.toCanvas(canvas, value, {
    width: o.size,
    margin: 4,
    errorCorrectionLevel: "H",
    color: { dark: o.color, light: o.background },
  });
  // The QR renderer sets inline pixel sizes for exports; previews must fit their container.
  canvas.style.width = "100%";
  canvas.style.height = "auto";
}
export async function exportQR(value, settings, format, name) {
  const o = validateQR(value, settings),
    options = {
      width: o.size,
      margin: 4,
      errorCorrectionLevel: "H",
      color: { dark: o.color, light: o.background },
    };
  let blob;
  if (format === "svg")
    blob = new Blob(
      [await QRCode.toString(value, { ...options, type: "svg" })],
      { type: "image/svg+xml" },
    );
  else {
    const canvas = document.createElement("canvas");
    await renderQR(canvas, value, settings);
    blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  }
  if (!blob) throw new Error("The QR image could not be exported.");
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `playqr-${name.replace(/[^a-z0-9]/gi, "-").slice(0, 60)}.${format}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

