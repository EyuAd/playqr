import test from "node:test";
import assert from "node:assert/strict";

const values = new Map();
let blocked = false;
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => {
    if (blocked) throw new DOMException("Storage full", "QuotaExceededError");
    values.set(key, value);
  },
};
globalThis.window = new EventTarget();
const storage = await import("../frontend/src/storage.js");
const app = { id: "com.example.app", title: "Example" };
function reset() {
  blocked = false;
  values.clear();
  storage.switchLibrary(null);
}

test("favorite failures preserve the previous saved library and report failure", () => {
  reset();
  assert.equal(storage.favorite(app), true);
  const saved = values.get("playqr-library-v2");
  blocked = true;
  assert.throws(() => storage.favorite(app), /Could not save on this device/);
  assert.deepEqual(storage.state.favorites, [app]);
  assert.equal(values.get("playqr-library-v2"), saved);
  assert.equal(storage.remember(app), false);
  assert.deepEqual(storage.state.recent, []);
  blocked = false;
  assert.equal(storage.favorite(app), false);
  assert.deepEqual(storage.state.favorites, []);
});

test("stale tabs cannot overwrite a newer browser library", () => {
  reset();
  assert.equal(storage.favorite(app), true);
  const incoming = {
    ...storage.initial(),
    favorites: [{ id: "com.another.app", title: "Saved in another tab" }],
  };
  const newer = JSON.stringify(incoming);
  values.set("playqr-library-v2", newer);
  assert.equal(storage.isLibraryCurrent(), false);
  assert.throws(() => storage.favorite(app), /another tab/);
  assert.equal(values.get("playqr-library-v2"), newer);
  assert.deepEqual(storage.state.favorites, [app]);
  storage.switchLibrary(null);
  assert.deepEqual(storage.state.favorites, incoming.favorites);
  assert.equal(storage.favorite(app), true);
});

test("the saved-app limit never silently evicts an existing favorite", () => {
  reset();
  storage.state.favorites = Array.from({ length: 100 }, (_, index) => ({
    id: `com.fixture.app${index}`,
    title: `Favorite ${index}`,
  }));
  assert.equal(storage.save(), true);
  const saved = values.get("playqr-library-v2");
  assert.throws(() => storage.favorite(app), /100 saved apps/);
  assert.equal(values.get("playqr-library-v2"), saved);
  assert.equal(storage.state.favorites.length, 100);
  assert.equal(storage.favorite(storage.state.favorites[0]), false);
  assert.equal(storage.favorite(app), true);
});

test("failed cloud restoration rolls back in-memory favorites and drafts", () => {
  reset();
  storage.favorite(app);
  blocked = true;
  assert.equal(storage.replaceCloud({ favorites: [], collections: [] }), false);
  assert.deepEqual(storage.state.favorites, [app]);
});

test("guest management key failures are actionable, not silent temporary identities", () => {
  reset();
  blocked = true;
  assert.throws(() => storage.ownerKey(), /needs browser storage/);
  blocked = false;
  const first = storage.ownerKey();
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(storage.ownerKey(), first);
});

test("storage events flag only the active library and preserve account isolation", () => {
  reset();
  storage.switchLibrary("account-a");
  let conflicts = 0;
  const listener = () => conflicts++;
  window.addEventListener("playqr:storage-conflict", listener);
  const event = (key) => {
    const value = new Event("storage");
    Object.defineProperty(value, "key", { value: key });
    window.dispatchEvent(value);
  };
  values.set(
    "playqr-library-v3:account-b",
    JSON.stringify({ favorites: [app] }),
  );
  event("playqr-library-v3:account-b");
  assert.equal(conflicts, 0);
  values.set(
    "playqr-library-v3:account-a",
    JSON.stringify({ favorites: [app] }),
  );
  event("playqr-library-v3:account-a");
  assert.equal(conflicts, 1);
  assert.deepEqual(storage.state.favorites, []);
  assert.equal(storage.save(), false);
  window.removeEventListener("playqr:storage-conflict", listener);
});
