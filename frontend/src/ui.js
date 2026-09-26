import { imageUrl } from "../../shared/domain.js";
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
  return [
    app.category?.replace(/_/g, " "),
    app.rating ? `★ ${app.rating.toFixed(1)}` : "",
    app.price === "0"
      ? "Free"
      : app.price
        ? `${app.currency} ${app.price}`
        : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
export function appCard(app, open, favoriteAction, isFavorite, addAction) {
  const card = el("article", { class: "app-card" });
  const main = button("", () => open(app), "app-open");
  main.append(
    icon(app),
    el(
      "span",
      { class: "app-summary" },
      el("strong", {}, app.title),
      el("span", { class: "muted" }, app.developer || "Google Play"),
      el("span", { class: "app-meta" }, metadata(app)),
    ),
  );
  card.append(main);
  if (app.description)
    card.append(el("p", { class: "card-description" }, app.description));
  const controls = el("div", { class: "card-controls" });
  if (favoriteAction)
    controls.append(
      button(
        isFavorite ? "♥ Saved" : "♡ Save",
        (e) => favoriteAction(app, e),
        "text-button",
      ),
    );
  if (addAction)
    controls.append(
      button("+ Collection", () => addAction(app), "text-button"),
    );
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
export async function copy(value) {
  try {
    await navigator.clipboard.writeText(value);
    toast("Link copied");
  } catch {
    throw new Error(
      "Clipboard access is unavailable. Select and copy the link below.",
    );
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

