import { el } from "./ui.js";
import { curate } from "../../shared/curation.js";
export function collectionCover(value, compact = false) {
  const c = curate(value, []);
  return el(
    "div",
    { class: `collection-cover cover-${c.cover}${compact ? " compact" : ""}` },
    el("span", { class: "cover-orbit", "aria-hidden": "true" }),
    el("span", { class: "cover-orbit second", "aria-hidden": "true" }),
    el("span", { class: "cover-label" }, c.category),
    el("span", { class: "cover-mark", "aria-hidden": "true" }, "↗"),
  );
}
