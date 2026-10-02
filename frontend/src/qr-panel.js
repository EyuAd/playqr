import { el, button, copy, share, guard } from "./ui.js";
export async function qrPanel(title, initialUrl, makeSmart, card = {}) {
  const panel = el(
    "section",
    { class: "qr-panel" },
    el(
      "div",
      { class: "section-heading" },
      el("strong", {}, "Ready to travel"),
      el("span", { class: "badge" }, "QR CODE"),
    ),
  );
  let destination = initialUrl,
    settings = { color: "#142e25", size: 1024, background: "white" };
  const canvas = el("canvas", {
      "aria-label": `QR code for ${title}`,
      role: "img",
    }),
    qrStage = el("div", { class: "qr-stage" }, canvas),
    caption = el("p", { class: "muted" }, "Scan to open on another device");
  const link = el("input", {
    readonly: true,
    value: destination,
    "aria-label": "Share destination",
    class: "destination",
  });
  const error = el("p", { class: "error-text", role: "status" });
  let qrModule;
  const draw = async () => {
    try {
      qrModule ||= await import("./qr.js");
      await qrModule.renderQR(canvas, destination, settings);
      error.textContent = "";
    } catch (e) {
      error.textContent = e.message;
    }
  };
  const controls = el(
    "div",
    { class: "share-actions" },
    button(
      "Copy link",
      guard(() => copy(destination)),
      "button primary",
    ),
    button(
      "Share ↗",
      guard(() => share(title, destination)),
    ),
  );
  const downloads = el(
    "div",
    { class: "share-actions" },
    button(
      "↓ PNG",
      guard(async () => {
        await draw();
        await qrModule.exportQR(destination, settings, "png", title);
      }),
    ),
    button(
      "↓ SVG",
      guard(async () => {
        await draw();
        await qrModule.exportQR(destination, settings, "svg", title);
      }),
    ),
  );
  panel.append(qrStage, caption, controls, downloads, link, error);
  panel.append(
    button(
      "Create share card ↗",
      guard(async () => {
        const { openShareCard } = await import("./share-card.js");
        await openShareCard({
          title,
          url: destination,
          settings: { ...settings },
          ...card,
        });
      }),
      "button share-card-button",
    ),
    el(
      "p",
      { class: "small-note" },
      "App artwork, a scan-ready QR, and a little PlayQR polish.",
    ),
  );
  if (makeSmart) {
    const smart = button(
      "Create smart link",
      guard(async () => {
        smart.disabled = true;
        try {
          const result = await makeSmart();
          destination = result.url;
          link.value = destination;
          smart.textContent = "Smart link ready ✓";
          caption.textContent =
            "Opens a matching store listing, or this app’s share page";
          await draw();
        } catch (e) {
          smart.disabled = false;
          throw e;
        }
      }),
      "button smart-button",
    );
    panel.append(
      smart,
      el(
        "p",
        { class: "small-note" },
        "Smart links include private visit counts in your library.",
      ),
    );
  }
  const color = el(
    "select",
    { "aria-label": "QR foreground" },
    el("option", { value: "#142e25" }, "Forest"),
    el("option", { value: "#121826" }, "Ink"),
    el("option", { value: "#173e82" }, "Cobalt"),
  );
  const size = el(
    "select",
    { "aria-label": "Export size" },
    [512, 1024, 2048].map((n) =>
      el("option", { value: n, selected: n === 1024 }, `${n} × ${n}`),
    ),
  );
  const bg = el(
    "select",
    { "aria-label": "QR background" },
    el("option", { value: "white" }, "White"),
    el("option", { value: "cream" }, "Warm white"),
  );
  const customize = el(
    "details",
    { class: "customize" },
    el("summary", {}, "Make it yours"),
    el(
      "div",
      { class: "customize-grid" },
      el("label", {}, "Ink", color),
      el("label", {}, "Background", bg),
      el("label", {}, "Export size", size),
    ),
    button(
      "Reset",
      () => {
        settings = { color: "#142e25", size: 1024, background: "white" };
        color.value = settings.color;
        bg.value = settings.background;
        size.value = "1024";
        void draw();
      },
      "text-button",
    ),
    el(
      "p",
      { class: "small-note" },
      "High contrast, a clear border, and strong error correction keep every code easy to scan.",
    ),
  );
  [color, size, bg].forEach((select) =>
    select.addEventListener("change", () => {
      settings = {
        color: color.value,
        size: Number(size.value),
        background: bg.value,
      };
      void draw();
    }),
  );
  panel.append(customize);
  await draw();
  return panel;
}
