import { session } from "./auth.js";
import { request } from "./api.js";
import { state, switchLibrary, replaceCloud } from "./storage.js";
import { librarySnapshot } from "../../shared/library.js";
let active = null,
  revision = 0,
  fingerprint = "",
  timer,
  running = false,
  generation = 0;
export let syncStatus = "Saved in this browser";
const checkpoint = () => `playqr-sync:${active}`;
function mark(pending) {
  localStorage.setItem(checkpoint(), JSON.stringify({ revision, pending }));
}
function status(value) {
  syncStatus = value;
  window.dispatchEvent(new Event("playqr:sync"));
}
export async function initializeWorkspace(reload = false) {
  const ticket = ++generation;
  clearTimeout(timer);
  active = session?.user.id || null;
  running = false;
  revision = 0;
  switchLibrary(active);
  fingerprint = JSON.stringify(librarySnapshot(state));
  if (!active) {
    status("Saved in this browser");
    return;
  }
  status("Loading your cloud library…");
  try {
    let previous = {};
    try {
      previous = JSON.parse(localStorage.getItem(checkpoint())) || {};
    } catch {
      /* Restore from server if checkpoint is unavailable. */
    }
    const result = await request("/account/library", {
      privateAccess: true,
      bearerToken: session.access_token,
    });
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
    if (!replaceCloud(result.data))
      throw new Error("Browser storage is full. Could not load cloud library.");
    fingerprint = JSON.stringify(librarySnapshot(state));
    mark(false);
    status("Library is up to date");
  } catch (e) {
    if (ticket === generation) status("Sync paused: " + e.message);
  }
}
export async function flush() {
  if (
    !active ||
    active !== session?.user.id ||
    running ||
    syncStatus.startsWith("Sync conflict")
  )
    return;
  let serialized;
  try {
    serialized = JSON.stringify(librarySnapshot(state));
  } catch (e) {
    status("Sync paused: " + e.message);
    return;
  }
  if (serialized === fingerprint) return;
  const ticket = generation;
  running = true;
  mark(true);
  status("Saving to your account…");
  try {
    const result = await request("/account/library", {
      method: "POST",
      privateAccess: true,
      bearerToken: session.access_token,
      data: { revision, data: JSON.parse(serialized) },
    });
    if (ticket !== generation) return;
    revision = result.revision;
    fingerprint = serialized;
    const pending = JSON.stringify(librarySnapshot(state)) !== serialized;
    mark(pending);
    status(pending ? "More changes waiting to sync…" : "Saved to your account");
    if (pending) timer = setTimeout(() => void flush(), 500);
  } catch (e) {
    if (ticket === generation)
      status(
        (e.message.includes("another device")
          ? "Sync conflict: "
          : "Sync paused: ") + e.message,
      );
  } finally {
    if (ticket === generation) running = false;
  }
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
