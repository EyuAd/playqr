import { el, button, icon } from "./ui.js";
import { parseStoreUrl, isIOS, storeLabel } from "../../shared/domain.js";
import { appDetails } from "./api.js";

export function pairPicker(app) {
  let paired = null;
  const section = el("details", { class: "pair-picker" });
  const fieldset = el("fieldset");
  const input = el("input", {
    type: "url",
    placeholder: isIOS(app.id)
      ? "https://play.google.com/store/apps/details?id=…"
      : "https://apps.apple.com/…/id…",
    "aria-label": "Matching app store link",
  });
  const preview = el("div"),
    status = el("p", { class: "small-note", role: "status" });
  const confirmed = el("input", { type: "checkbox" });
  const confirmation = el(
    "label",
    { class: "confirm-revoke", hidden: true },
    confirmed,
    el("span", {}, "I checked the name and developer. These are the same app."),
  );
  let sequence = 0;
  input.addEventListener("input", () => {
    sequence++;
    paired = null;
    confirmed.checked = false;
    confirmation.hidden = true;
    preview.replaceChildren();
    status.textContent = "";
  });
  const load = button("Check matching app", async () => {
    const ticket = ++sequence,
      link = parseStoreUrl(input.value);
    paired = null;
    confirmed.checked = false;
    confirmation.hidden = true;
    if (!link || isIOS(link.id) === isIOS(app.id)) {
      status.textContent = "Paste a valid app link from the other store.";
      return;
    }
    load.disabled = true;
    status.textContent = "Checking the store listing…";
    try {
      const { app: match } = await appDetails(link.id);
      if (ticket !== sequence) return;
      paired = match;
      preview.replaceChildren(
        el(
          "div",
          { class: "pair-preview" },
          icon(match),
          el(
            "div",
            {},
            el("strong", {}, match.title),
            el("p", { class: "muted" }, match.developer),
            el("span", { class: "platform-badge" }, storeLabel(match.id)),
          ),
        ),
      );
      confirmation.hidden = false;
      status.textContent =
        "Compare the listing above before confirming. PlayQR does not verify that these developers are related.";
    } catch (e) {
      if (ticket === sequence) status.textContent = e.message;
    } finally {
      load.disabled = false;
    }
  });
  fieldset.append(
    el(
      "p",
      { class: "small-note" },
      "Optional: one smart QR for Android and iPhone. Paste the corresponding app’s link, then verify the match.",
    ),
    input,
    load,
    preview,
    confirmation,
    status,
  );
  section.append(
    el("summary", {}, "Connect an Android / iPhone version"),
    fieldset,
  );
  return {
    element: section,
    selection() {
      if (!input.value.trim()) return {};
      if (!paired || !confirmed.checked)
        throw new Error(
          "Check and confirm the matching app first, or clear its link.",
        );
      return { pairedId: paired.id, confirmedPair: true };
    },
    lock() {
      fieldset.disabled = true;
      status.textContent =
        "Pairing saved in this smart link. Existing QR codes keep this destination.";
    },
  };
}
