import { el, button, guard, toast } from "./ui.js";
import { state, save } from "./storage.js";
import { session } from "./auth.js";
import {
  createBackup,
  parseBackup,
  mergeBackup,
  MAX_BACKUP_BYTES,
} from "../../shared/backup.js";

export function backupPanel(refresh) {
  const file = el("input", {
    type: "file",
    accept: ".json,application/json",
    hidden: true,
    "aria-label": "Import library backup",
  });
  file.addEventListener(
    "change",
    guard(async () => {
      const selected = file.files[0];
      file.value = "";
      if (!selected) return;
      if (session)
        throw new Error("Sign out before importing a guest library.");
      if (selected.size > MAX_BACKUP_BYTES)
        throw new Error("Choose a PlayQR backup smaller than 1 MB.");
      const incoming = parseBackup(await selected.text());
      if (session)
        throw new Error(
          "Your account changed. Please try again after signing out.",
        );
      const preview = mergeBackup(state, incoming);
      const dialog = el("dialog", {
        class: "dialog",
        "aria-labelledby": "backup-title",
      });
      dialog.append(
        el("h2", { id: "backup-title" }, "Add this library?"),
        el(
          "p",
          {},
          `${preview.favorites.length - state.favorites.length} new favorites and ${preview.collections.length - state.collections.length} new collection drafts. Your existing items stay untouched. Identical items are skipped; different drafts with the same ID are kept as separate copies.`,
        ),
        el(
          "p",
          { class: "small-note" },
          "Shared-link ownership, account sessions, and browsing history are not imported.",
        ),
        el(
          "div",
          { class: "detail-actions" },
          button("Cancel", () => dialog.close()),
          button(
            "Import library",
            guard(() => {
              if (session) {
                dialog.close();
                throw new Error(
                  "Your account changed. Guest import was cancelled.",
                );
              }
              const merged = mergeBackup(state, incoming);
              const previous = {
                favorites: state.favorites,
                collections: state.collections,
              };
              Object.assign(state, merged);
              if (!save()) {
                Object.assign(state, previous);
                throw new Error(
                  "Browser storage is full. Nothing was imported.",
                );
              }
              dialog.close();
              refresh();
              toast("Library imported. Existing items were preserved.");
            }),
            "button primary",
          ),
        ),
      );
      document.body.append(dialog);
      dialog.addEventListener("close", () => dialog.remove());
      dialog.showModal();
      dialog.querySelector("button").focus();
    }),
  );
  return el(
    "section",
    { class: "backup-panel" },
    el(
      "div",
      {},
      el("h2", {}, "Your library. Take it with you."),
      el(
        "p",
        { class: "small-note" },
        "Back up favorites and collection drafts before changing browsers or domains. This file does not transfer shared-link management or sign-in details.",
      ),
    ),
    el(
      "div",
      { class: "detail-actions" },
      button(
        "Export backup",
        guard(() => {
          if (session)
            throw new Error(
              "Your account changed. Refresh your library first.",
            );
          const value = JSON.stringify(createBackup(state), null, 2);
          if (new Blob([value]).size > MAX_BACKUP_BYTES)
            throw new Error(
              "This library is larger than 1 MB. Reduce it before exporting.",
            );
          const url = URL.createObjectURL(
            new Blob([value], { type: "application/json" }),
          );
          el("a", {
            href: url,
            download: `playqr-library-${new Date().toISOString().slice(0, 10)}.json`,
          }).click();
          setTimeout(() => URL.revokeObjectURL(url), 10000);
        }),
      ),
      button("Import backup", () => file.click()),
    ),
    file,
  );
}
