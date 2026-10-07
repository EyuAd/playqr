import { session } from "./auth.js";
import { request } from "./api.js";
import {
  state,
  switchLibrary,
  replaceCloud,
  isLibraryCurrent,
  storageError,
} from "./storage.js";
import { librarySnapshot } from "../../shared/library.js";
let active = null,
  revision = 0,
  fingerprint = "",
  timer,
  running = null,
  generation = 0;
export let syncStatus = "Saved in this browser";
const checkpoint = () => `playqr-sync:${active}`;
function mark(pending) {
  try {
    localStorage.setItem(checkpoint(), JSON.stringify({ revision, pending }));
  } catch {
    throw new Error(
      "Browser storage is full or unavailable. Your saved library is preserved; free some space, then try Sync now again.",
    );
  }
}
function status(value) {
  syncStatus = value;
  window.dispatchEvent(new Event("playqr:sync"));
}
export async function initializeWorkspace(reload = false) {
  const ticket = ++generation;
  clearTimeout(timer);
  active = session?.user.id || null;
  running = null;
  revision = 0;
  switchLibrary(active);
  if (!active) {
    status("Saved in this browser");
    return;
  }
  status("Loading your cloud library…");
  try {
    fingerprint = JSON.stringify(librarySnapshot(state));
    let previous = {};
    try {
      previous = JSON.parse(localStorage.getItem(checkpoint())) || {};
    } catch {
      /* Restore from server if checkpoint is unavailable. */
    }
    const restoreController = new AbortController();
    const restoreTimeout = setTimeout(
      () =>
        restoreController.abort(
          new DOMException(
            "Cloud restore took too long. Your browser copy is preserved. Try Reload cloud copy from Account to reconnect.",
            "TimeoutError",
          ),
        ),
      10000,
    );
    let result;
    try {
      result = await request("/account/library", {
        privateAccess: true,
        bearerToken: session.access_token,
        signal: restoreController.signal,
      });
    } finally {
      clearTimeout(restoreTimeout);
    }
    if (ticket !== generation) return;
    revision = result.revision;
    if (previous.pending && !reload) {
      if (
        result.data &&
        JSON.stringify(librarySnapshot(result.data)) === fingerprint
      ) {
        mark(false);
        status("Library is up to date");
        return;
      }
      if (previous.revision !== revision) {
        revision = previous.revision;
        status(
          "Sync conflict: your local edits are safe. Reload the cloud copy from Account to resolve.",
        );
        return;
      }
      fingerprint = "";
      await flush();
      return;
    }
    if (!replaceCloud(result.data)) throw new Error(storageError);
    fingerprint = JSON.stringify(librarySnapshot(state));
    mark(false);
    status("Library is up to date");
  } catch (e) {
    if (ticket === generation) status("Sync paused: " + e.message);
  }
}
export async function flush() {
  if (!active || active !== session?.user.id) return;
  if (running?.ticket === generation) return running.promise;
  if (syncStatus.startsWith("Sync conflict")) return;
  if (!isLibraryCurrent()) {
    status(
      "Sync conflict: your library changed in another tab. Reload this tab before syncing; the other tab’s saved copy is preserved.",
    );
    return;
  }
  let serialized;
  try {
    serialized = JSON.stringify(librarySnapshot(state));
  } catch (e) {
    status("Sync paused: " + e.message);
    return;
  }
  if (serialized === fingerprint) return;
  const ticket = generation;
  const operation = { ticket, promise: null };
  running = operation;
  operation.promise = (async () => {
    try {
      mark(true);
      status("Saving to your account…");
      const result = await request("/account/library", {
        method: "POST",
        privateAccess: true,
        bearerToken: session.access_token,
        data: { revision, data: JSON.parse(serialized) },
      });
      if (ticket !== generation) return;
      if (!isLibraryCurrent()) {
        status(
          "Sync conflict: another tab saved a newer browser copy while this request finished. That copy is preserved; reload this tab before syncing again.",
        );
        return;
      }
      revision = result.revision;
      const pending = JSON.stringify(librarySnapshot(state)) !== serialized;
      mark(pending);
      fingerprint = serialized;
      status(
        pending ? "More changes waiting to sync…" : "Saved to your account",
      );
      if (pending) timer = setTimeout(() => void flush(), 500);
    } catch (e) {
      if (ticket === generation)
        status(
          (e.message.includes("another device")
            ? "Sync conflict: "
            : "Sync paused: ") + e.message,
        );
    } finally {
      if (running === operation) running = null;
    }
  })();
  return operation.promise;
}
window.addEventListener("playqr:library", () => {
  if (!active) return;
  try {
    if (JSON.stringify(librarySnapshot(state)) === fingerprint) return;
    mark(true);
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), 900);
  } catch (e) {
    status("Sync paused: " + e.message);
  }
});
window.addEventListener("online", () => void flush());
window.addEventListener("playqr:storage-conflict", () => {
  if (!active) return;
  clearTimeout(timer);
  status(
    "Sync conflict: your library changed in another tab. Reload this tab before syncing; the other tab’s saved copy is preserved.",
  );
});
