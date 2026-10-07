import { el, button, copy, share, guard } from "./ui.js";
import { symbol } from "./symbols.js";
import { shareLinks } from "./share-links.js";

const openDialogs = new Set();
let previousOverflow, previousGutter;

export function shareChoices(title, url) {
  return el(
    "div",
    { class: "share-choices", "aria-label": "Share via" },
    shareLinks(title, url).map(({ name, icon, href }) =>
      el(
        "a",
        {
          class: "share-choice",
          href,
          target: "_blank",
          rel: "noopener noreferrer",
          "aria-label": `Share via ${name}`,
        },
        symbol(icon),
        el("span", {}, name),
      ),
    ),
  );
}

export function dialogHeader(title, dialog, id) {
  return el(
    "div",
    { class: "share-dialog-heading" },
    el("h2", { id }, title),
    button(
      [symbol("close"), el("span", { class: "sr-only" }, "Close")],
      () => dialog.close(),
      "icon-button share-close",
    ),
  );
}

export function showShareDialog(dialog) {
  const opener = document.activeElement;
  document.body.append(dialog);
  const release = () => {
    openDialogs.delete(dialog);
    dialog.remove();
    if (!openDialogs.size) {
      document.documentElement.style.overflow = previousOverflow;
      document.documentElement.style.scrollbarGutter = previousGutter;
    }
    if (
      !document.querySelector("dialog[open]") &&
      opener instanceof HTMLElement &&
      opener.isConnected
    )
      opener.focus({ preventScroll: true });
  };
  dialog.addEventListener("close", release, { once: true });
  if (!openDialogs.size) {
    previousOverflow = document.documentElement.style.overflow;
    previousGutter = document.documentElement.style.scrollbarGutter;
    document.documentElement.style.scrollbarGutter = "stable";
    document.documentElement.style.overflow = "hidden";
  }
  openDialogs.add(dialog);
  try {
    dialog.showModal();
    dialog.querySelector(".share-close")?.focus({ preventScroll: true });
  } catch (error) {
    release();
    throw error;
  }
}

export function openShareVia({ title, url, createCard }) {
  const dialog = el("dialog", {
    class: "dialog share-via-dialog",
    "aria-labelledby": "share-via-title",
  });
  const actions = el(
    "div",
    { class: "share-actions" },
    button(
      "Copy link",
      guard(() => copy(url)),
    ),
  );
  if (navigator.share)
    actions.append(
      button(
        "More options",
        guard(() => share(title, url)),
      ),
    );
  dialog.append(
    dialogHeader("Share via", dialog, "share-via-title"),
    el("p", { class: "share-subtitle" }, title),
    shareChoices(title, url),
    actions,
    el("input", {
      readonly: true,
      value: url,
      class: "destination",
      "aria-label": "Link to share",
    }),
  );
  if (createCard)
    dialog.append(
      button(
        [symbol("scan"), "QR card / PDF"],
        guard(async () => {
          dialog.close();
          await createCard();
        }),
        "button share-card-button",
      ),
    );
  dialog.append(
    el(
      "p",
      { class: "small-note share-hint" },
      "Social options share the link. Export a card to share the QR artwork.",
    ),
  );
  showShareDialog(dialog);
}
