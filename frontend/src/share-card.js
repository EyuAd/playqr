import { renderQR } from "./qr.js";
import { imageUrl, validateQR } from "../../shared/domain.js";
import { el, button, guard } from "./ui.js";

function loadIcon(url) {
  return new Promise((resolve) => {
    const src = imageUrl(url);
    if (!src) {
      resolve(null);
      return;
    }
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.referrerPolicy = "no-referrer";
    const timer = setTimeout(() => {
      image.src = "";
      resolve(null);
    }, 5000);
    image.onload = () => {
      clearTimeout(timer);
      resolve(image);
    };
    image.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    image.src = src;
  });
}
function lines(ctx, value, x, y, maxWidth, lineHeight, maxLines) {
  const words = Array.from(String(value || ""));
  let line = "",
    row = 0;
  while (words.length) {
    const char = words.shift();
    if (ctx.measureText(line + char).width > maxWidth) {
      if (row === maxLines - 1) {
        while (ctx.measureText(line + "…").width > maxWidth)
          line = line.slice(0, -1);
        ctx.fillText(line + "…", x, y);
        return;
      }
      ctx.fillText(line.trim(), x, y);
      y += lineHeight;
      row++;
      line = char;
    } else line += char;
  }
  ctx.fillText(line.trim(), x, y);
}
export async function renderShareCard(
  canvas,
  { title, url, settings = {}, apps = [], kind = "app" },
) {
  const options = validateQR(url, settings),
    width = options.size;
  canvas.width = width;
  canvas.height = Math.round(width * 1.25);
  const ctx = canvas.getContext("2d");
  ctx.scale(width / 1080, width / 1080);
  ctx.fillStyle = options.background;
  ctx.fillRect(0, 0, 1080, 1350);
  ctx.fillStyle = options.color;
  ctx.fillRect(0, 0, 1080, 14);
  ctx.font = "700 35px system-ui";
  ctx.fillText("PlayQR.", 72, 88);
  ctx.font = "500 19px system-ui";
  ctx.textAlign = "right";
  ctx.fillText("GOOD APPS TRAVEL", 1008, 84);
  ctx.textAlign = "left";
  const images = await Promise.all(
    apps
      .slice(0, kind === "collection" ? 4 : 1)
      .map((app) => loadIcon(app.icon)),
  );
  let drawn = 0;
  for (const image of images) {
    if (!image) continue;
    const x = 72 + drawn * 98;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, 142, 82, 82, 18);
    ctx.clip();
    ctx.drawImage(image, x, 142, 82, 82);
    ctx.restore();
    drawn++;
  }
  ctx.fillStyle = options.color;
  ctx.font = "600 19px system-ui";
  ctx.fillText(
    kind === "collection"
      ? `${apps.length} APPS · ONE COLLECTION`
      : "AN ANDROID APP WORTH SHARING",
    72,
    drawn ? 260 : 192,
  );
  ctx.font = "700 51px system-ui";
  lines(ctx, title, 72, drawn ? 325 : 265, 936, 60, 2);
  const qr = document.createElement("canvas");
  await renderQR(qr, url, { ...settings, size: 1024 });
  ctx.drawImage(qr, 180, 450, 720, 720);
  ctx.textAlign = "center";
  ctx.font = "600 30px system-ui";
  ctx.fillText(
    kind === "collection"
      ? "Scan to explore the collection"
      : "Scan to discover this app",
    540,
    1210,
  );
  ctx.font = "400 22px system-ui";
  ctx.fillText("Find it. Scan it. Pass it on.", 540, 1254);
  ctx.strokeStyle = options.color;
  ctx.globalAlpha = 0.16;
  ctx.beginPath();
  ctx.moveTo(72, 1290);
  ctx.lineTo(1008, 1290);
  ctx.stroke();
  ctx.globalAlpha = 1;
  return { omitted: images.filter((image) => !image).length };
}
export async function openShareCard(options) {
  const canvas = el("canvas", {
    class: "share-card-preview",
    role: "img",
    "aria-label": `Share card for ${options.title}`,
  });
  const status = el(
    "p",
    { class: "small-note", role: "status" },
    "Preparing your card…",
  );
  const dialog = el("dialog", {
    class: "dialog share-card-dialog",
    "aria-labelledby": "share-card-title",
  });
  const download = button(
    "Download card · PNG",
    guard(async () => {
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) throw new Error("The card could not be exported.");
      const url = URL.createObjectURL(blob),
        a = el("a", {
          href: url,
          download: `playqr-card-${options.title.replace(/[^a-z0-9]/gi, "-").slice(0, 60)}.png`,
        });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }),
    "button primary",
  );
  download.disabled = true;
  dialog.append(
    el(
      "div",
      { class: "section-heading" },
      el("h2", { id: "share-card-title" }, "Ready to share."),
      button("Close", () => dialog.close(), "text-button"),
    ),
    canvas,
    status,
    download,
  );
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
  try {
    const { omitted } = await renderShareCard(canvas, options);
    status.textContent = `${canvas.width} × ${canvas.height} PNG · ${omitted ? "Some icons couldn’t load; the QR still works." : "Original artwork. Scan-ready QR."}`;
    download.disabled = false;
  } catch {
    status.textContent =
      "The card could not be generated. Close this preview and try again.";
  }
}

