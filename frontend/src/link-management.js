import { el, button, toast } from "./ui.js";
import { request } from "./api.js";

export function manageLink(link, onChanged) {
  const dialog = el("dialog", {
    class: "dialog",
    "aria-labelledby": "manage-link-title",
  });
  const title = el("input", {
    value: link.title,
    maxlength: 80,
    required: true,
    "aria-label": "Published link title",
  });
  const status = el("p", { class: "error-text", role: "status" });
  const close = button("Close", () => dialog.close(), "text-button");
  const save = el(
    "button",
    { type: "submit", class: "button primary" },
    "Save title",
  );
  const confirm = el("input", { type: "checkbox" });
  const revoke = button(
    "Revoke link",
    async () => {
      if (!confirm.checked) return;
      await change("DELETE");
    },
    "button danger-button",
  );
  revoke.disabled = true;
  confirm.addEventListener("change", () => {
    revoke.disabled = !confirm.checked;
  });
  async function change(method) {
    save.disabled = true;
    revoke.disabled = true;
    close.disabled = true;
    confirm.disabled = true;
    status.textContent = "";
    try {
      await request("/links/" + link.code, {
        method,
        privateAccess: true,
        ...(method === "PATCH" ? { data: { title: title.value.trim() } } : {}),
      });
      dialog.close();
      toast(
        method === "DELETE"
          ? "Link revoked and its visit data removed."
          : "Link title updated. Existing QR codes still work.",
      );
      onChanged();
    } catch (e) {
      status.textContent = e.message;
      save.disabled = false;
      revoke.disabled = !confirm.checked;
      close.disabled = false;
      confirm.disabled = false;
    }
  }
  const form = el(
    "form",
    {},
    el("label", {}, "Display title", title),
    el(
      "p",
      { class: "small-note" },
      "Changes the public share-page title, not the app or destination.",
    ),
    save,
  );
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (title.value.trim()) void change("PATCH");
    else {
      status.textContent = "Enter a title first.";
      title.focus();
    }
  });
  dialog.append(
    el(
      "div",
      { class: "section-heading" },
      el("h2", { id: "manage-link-title" }, "Manage shared link"),
      close,
    ),
    form,
    el(
      "section",
      { class: "revoke-panel" },
      el("h3", {}, "Retire this link"),
      el(
        "p",
        { class: "small-note" },
        "Revoking permanently deletes this link and its visit data. QR codes using this smart link will stop working. Download your analytics first. Local drafts and direct Play Store QR codes are unaffected.",
      ),
      el(
        "label",
        { class: "confirm-revoke" },
        confirm,
        el("span", {}, "I understand this cannot be undone."),
      ),
      revoke,
    ),
    status,
  );
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
  title.focus();
}

