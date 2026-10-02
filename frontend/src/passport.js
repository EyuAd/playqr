import { el } from "./ui.js";
import { symbol } from "./symbols.js";

// A real, locally generated QR code, not a decorative approximation.
export function appPassport() {
  const canvas = el("canvas", {
    class: "passport-canvas",
    role: "img",
    "aria-label": "QR code to open PlayQR on another device",
  });
  const status = el("span", { class: "passport-caption" }, "Preparing QR…");
  const destination =
    location.protocol === "https:"
      ? location.origin + location.pathname
      : "https://eyuad.github.io/playqr/";
  const art = el(
    "aside",
    { class: "exchange-art", "aria-label": "Try a real PlayQR code" },
    el(
      "div",
      { class: "exchange-meta" },
      el("span", {}, "THE APP EXCHANGE"),
      symbol("arrow"),
    ),
    symbol("arrow", "exchange-arrow"),
    el(
      "div",
      { class: "passport" },
      el(
        "div",
        { class: "passport-top" },
        el("strong", {}, "PlayQR"),
        el("span", {}, "OPEN / SHARE / REPEAT"),
      ),
      el(
        "div",
        { class: "passport-body" },
        el(
          "div",
          {},
          el("span", { class: "ticket-label" }, "A SHORTCUT TO"),
          el(
            "p",
            { class: "ticket-title" },
            "Your next",
            el("br"),
            el("em", {}, "discovery."),
          ),
          el("span", { class: "ticket-platforms" }, "ANDROID + iOS"),
        ),
        canvas,
      ),
      el(
        "div",
        { class: "passport-stub" },
        symbol("scan"),
        status,
        el("span", { class: "ticket-number", "aria-hidden": "true" }, "001"),
      ),
    ),
    el(
      "p",
      { class: "exchange-bottom" },
      el("span", {}, "Different phones."),
      el("span", {}, "Same good find."),
    ),
  );
  void import("./qr.js")
    .then(({ renderQR }) =>
      renderQR(canvas, destination, {
        size: 512,
        color: "#121826",
        background: "white",
      }),
    )
    .then(() => {
      status.textContent = "Scan to open PlayQR";
    })
    .catch(() => {
      canvas.hidden = true;
      status.textContent = "Find it. Share it. Open it.";
    });
  return art;
}
