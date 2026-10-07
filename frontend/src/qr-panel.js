import { el, button, copy, guard } from "./ui.js";
import { openShareVia } from "./sharing.js";
export async function qrPanel(title, initialUrl, makeSmart, card = {}) {
  const panel = el(
    "section",
    { class: "qr-panel" },
    el(
      "div",
      { class: "section-heading" },
      el("strong", {}, "Your app, one scan away."),
      el("span", { class: "badge" }, "QR CODE"),
    ),
  );
  let destination = initialUrl,
    settings = { color: "#121826", size: 1024, background: "white" };
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
  const retry = button("Retry QR code", () => void draw(), "text-button");
  retry.hidden = true;
  let qrModule,
    drawSequence = 0,
    rendered = false;
  const exportButtons = [];
  function updateExports() {
    exportButtons.forEach((control) => {
      control.disabled = !rendered || control.hasAttribute("aria-busy");
    });
  }
  const draw = async () => {
    const ticket = ++drawSequence,
      value = destination,
      options = { ...settings };
    rendered = false;
    canvas.hidden = true;
    retry.hidden = true;
    qrStage.setAttribute("aria-busy", "true");
    updateExports();
    try {
      qrModule ||= await import("./qr.js");
      const preview = document.createElement("canvas");
      await qrModule.renderQR(preview, value, options);
      if (ticket !== drawSequence) return false;
      canvas.width = preview.width;
      canvas.height = preview.height;
      canvas.getContext("2d").drawImage(preview, 0, 0);
      canvas.style.width = "100%";
      canvas.style.height = "auto";
      canvas.hidden = false;
      rendered = true;
      error.textContent = "";
      return true;
    } catch (e) {
      if (ticket === drawSequence) {
        canvas.width = canvas.height = 0;
        error.textContent =
          "The QR code could not be prepared. Retry, or copy the link instead. " +
          e.message;
        retry.hidden = false;
      }
      return false;
    } finally {
      if (ticket === drawSequence) {
        qrStage.removeAttribute("aria-busy");
        updateExports();
      }
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
    button("Share via", () => {
      const url = destination,
        options = { ...settings };
      openShareVia({
        title,
        url,
        createCard: () => createCard(url, options),
      });
    }),
  );
  const downloads = el("div", { class: "share-actions" });
  for (const format of ["png", "svg"]) {
    const download = button(
      "↓ " + format.toUpperCase(),
      guard(async () => {
        if (download.disabled || !rendered) return;
        const value = destination,
          options = { ...settings };
        download.disabled = true;
        download.setAttribute("aria-busy", "true");
        try {
          await qrModule.exportQR(value, options, format, title);
        } finally {
          download.removeAttribute("aria-busy");
          download.disabled = !rendered;
        }
      }),
    );
    download.disabled = true;
    exportButtons.push(download);
    downloads.append(download);
  }
  panel.append(qrStage, caption, controls, downloads, link, error, retry);
  async function createCard(value = destination, customization = settings) {
    const options = {
      ...card,
      title,
      url: value,
      settings: { ...customization },
    };
    const { openShareCard } = await import("./share-card.js");
    if (!panel.isConnected) return;
    await openShareCard(options);
  }
  const create = button(
    "Create share card ↗",
    guard(async () => {
      if (create.hasAttribute("aria-busy")) return;
      create.setAttribute("aria-busy", "true");
      create.setAttribute("aria-disabled", "true");
      try {
        await createCard();
      } finally {
        create.removeAttribute("aria-busy");
        create.removeAttribute("aria-disabled");
      }
    }),
    "button share-card-button",
  );
  panel.append(
    create,
    el(
      "p",
      { class: "small-note" },
      "A printable card with original app artwork and your QR.",
    ),
  );
  if (makeSmart) {
    const smart = button(
      "Create smart link",
      guard(async () => {
        if (smart.disabled) return;
        smart.disabled = true;
        smart.setAttribute("aria-busy", "true");
        smart.textContent = "Creating smart link…";
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
          smart.textContent = "Create smart link";
          throw e;
        } finally {
          smart.removeAttribute("aria-busy");
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
    el("option", { value: "#121826" }, "Ink"),
    el("option", { value: "#173e82" }, "Cobalt"),
    el("option", { value: "#142e25" }, "Forest"),
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
        settings = { color: "#121826", size: 1024, background: "white" };
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
