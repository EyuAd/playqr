import { imageUrl, storeLabel } from "../../shared/domain.js";
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith("on"))
      node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "class") node.className = value;
    else if (value !== false && value != null)
      node.setAttribute(key, value === true ? "" : value);
  }
  children.flat(Infinity).forEach((child) => {
    if (child != null)
      node.append(
        child instanceof Node ? child : document.createTextNode(String(child)),
      );
  });
  return node;
}
export const button = (label, action, cls = "button secondary") =>
  el("button", { class: cls, type: "button", onclick: action }, label);
export function icon(app, large = false) {
  const wrapper = el("span", { class: "app-icon" + (large ? " large" : "") });
  const src = imageUrl(app.icon);
  const fail = () => {
    wrapper.replaceChildren(
      el("span", { class: "icon-error" }, "Icon unavailable"),
    );
  };
  if (src) {
    const img = el("img", {
      src,
      alt: "",
      width: large ? 88 : 64,
      height: large ? 88 : 64,
      loading: "lazy",
      referrerpolicy: "no-referrer",
    });
    img.addEventListener("error", fail, { once: true });
    wrapper.append(img);
  } else fail();
  return wrapper;
}
export const prettyNumber = (n) =>
  new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
export function metadata(app) {
  const numeric = (value) =>
    typeof value === "number" ||
    (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value.trim()))
      ? Number(value)
      : NaN;
  const category =
      typeof app?.category === "string"
        ? app.category.replace(/_/g, " ").trim().slice(0, 100)
        : "",
    rating = numeric(app?.rating),
    price = numeric(app?.price),
    currency =
      typeof app?.currency === "string" &&
      /^[a-z]{3}$/i.test(app.currency.trim())
        ? app.currency.trim().toUpperCase()
        : "";
  return [
    category,
    Number.isFinite(rating) && rating > 0 && rating <= 5
      ? `★ ${rating.toFixed(1)}`
      : "",
    price === 0
      ? "Free"
      : Number.isFinite(price) && price > 0 && currency
        ? `${currency} ${String(app.price).trim().slice(0, 20)}`
        : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
export function favoriteButton(app, isFavorite, action) {
  const control = button(
    "",
    (event) => {
      try {
        const selected = action(event);
        if (typeof selected === "boolean") update(selected);
      } catch (error) {
        toast(error.message);
      }
    },
    "text-button",
  );
  control.setAttribute(
    "aria-label",
    `Save ${app.title} (${storeLabel(app.id)}) to your library`,
  );
  function update(selected) {
    control.textContent = selected ? "♥ Saved" : "♡ Save";
    control.setAttribute("aria-pressed", String(selected));
  }
  update(isFavorite);
  return control;
}
export function appCard(app, open, favoriteAction, isFavorite, addAction) {
  const card = el("article", { class: "app-card" });
  const main = button("", () => open(app), "app-open");
  main.setAttribute("aria-label", `View ${app.title} on ${storeLabel(app.id)}`);
  main.append(
    icon(app),
    el(
      "span",
      { class: "app-summary" },
      el("strong", {}, app.title),
      el("span", { class: "muted" }, app.developer || storeLabel(app.id)),
      el("span", { class: "platform-badge" }, storeLabel(app.id)),
      el("span", { class: "app-meta" }, metadata(app)),
    ),
  );
  card.append(main);
  if (app.description)
    card.append(el("p", { class: "card-description" }, app.description));
  const controls = el("div", { class: "card-controls" });
  if (favoriteAction)
    controls.append(
      favoriteButton(app, isFavorite, (event) => favoriteAction(app, event)),
    );
  if (addAction) {
    const add = button("+ Collection", () => addAction(app), "text-button");
    add.setAttribute(
      "aria-label",
      `Add ${app.title} (${storeLabel(app.id)}) to a collection`,
    );
    controls.append(add);
  }
  card.append(controls);
  return card;
}
export function empty(title, description, action) {
  return el(
    "div",
    { class: "empty-state" },
    el("span", { class: "empty-symbol", "aria-hidden": "true" }, "↗"),
    el("h3", {}, title),
    el("p", {}, description),
    action,
  );
}
export function skeleton() {
  return el(
    "div",
    { class: "results-grid", "aria-label": "Loading apps" },
    Array.from({ length: 4 }, () =>
      el(
        "div",
        { class: "skeleton", "aria-hidden": "true" },
        el("i"),
        el("span"),
        el("span"),
      ),
    ),
  );
}
export function toast(message) {
  const node = document.querySelector("#toast");
  node.textContent = message;
  node.classList.add("visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("visible"), 3500);
}
let manualCopyDialog;
function showManualCopy(value) {
  if (manualCopyDialog?.open) {
    const input = manualCopyDialog.querySelector("input");
    input.value = String(value);
    input.focus({ preventScroll: true });
    input.select();
    return;
  }
  const opener = document.activeElement,
    root = document.documentElement,
    previousOverflow = root.style.overflow,
    previousGutter = root.style.scrollbarGutter;
  const dialog = el("dialog", {
    class: "dialog manual-copy-dialog",
    "aria-labelledby": "manual-copy-title",
    "aria-describedby": "manual-copy-hint",
  });
  const input = el("input", {
    type: "url",
    value: String(value),
    readonly: true,
    class: "destination",
    "aria-label": "Link to copy",
    "aria-describedby": "manual-copy-hint",
  });
  const select = () => {
    input.focus({ preventScroll: true });
    input.select();
  };
  dialog.append(
    el(
      "div",
      { class: "section-heading" },
      el("h2", { id: "manual-copy-title" }, "Copy link manually"),
      button("Close", () => dialog.close(), "text-button"),
    ),
    el(
      "p",
      { id: "manual-copy-hint" },
      "Your browser could not copy this link automatically. Copy the selected link with Ctrl+C or ⌘C. On a phone, touch and hold the link, then choose Copy.",
    ),
    input,
    button("Select link", select),
  );
  const release = () => {
    dialog.remove();
    if (manualCopyDialog === dialog) manualCopyDialog = null;
    root.style.overflow = previousOverflow;
    root.style.scrollbarGutter = previousGutter;
    if (
      opener instanceof HTMLElement &&
      opener.isConnected &&
      (!document.querySelector("dialog[open]") ||
        opener.closest("dialog[open]"))
    )
      opener.focus({ preventScroll: true });
  };
  dialog.addEventListener("close", release, { once: true });
  manualCopyDialog = dialog;
  document.body.append(dialog);
  root.style.scrollbarGutter = "stable";
  root.style.overflow = "hidden";
  try {
    dialog.showModal();
    select();
  } catch (error) {
    release();
    throw error;
  }
}
export async function copy(value) {
  try {
    await navigator.clipboard.writeText(value);
    toast("Link copied");
    return true;
  } catch {
    showManualCopy(value);
    return false;
  }
}
export async function share(title, url) {
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
    } catch (e) {
      if (e.name !== "AbortError") throw e;
    }
  } else await copy(url);
}

export const guard =
  (fn) =>
  async (...args) => {
    try {
      await fn(...args);
    } catch (e) {
      if (e.name !== "AbortError")
        toast(
          e.name === "TimeoutError"
            ? "That took too long. Please retry."
            : e.message,
        );
    }
  };
export function heading(kicker, title, description) {
  return el(
    "div",
    { class: "page-heading" },
    el("p", { class: "eyebrow" }, kicker),
    el("h1", {}, title),
    description ? el("p", { class: "lede" }, description) : null,
  );
}
export function errorPanel(message, retry) {
  return empty("Something didn’t connect", message, button("Try again", retry));
}
