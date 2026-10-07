let key = "playqr-library-v2";
export let storageError = "";
function storedValue(storageKey) {
  try {
    return localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}
let persisted = storedValue(key);
const staleLibraryMessage =
  "Your library changed in another tab. Reload this tab before saving so neither copy is overwritten.";
export const initial = () => ({
  favorites: [],
  recent: [],
  searches: [],
  collections: [],
  shares: [],
  theme: "system",
});
export function read(storageKey = key) {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey)) || {},
      result = initial();
    const isApp = (a) =>
      a && typeof a.id === "string" && typeof a.title === "string";
    for (const name of ["favorites", "recent"])
      result[name] = Array.isArray(value[name])
        ? value[name].filter(isApp).slice(0, 100)
        : [];
    result.searches = Array.isArray(value.searches)
      ? value.searches.filter((q) => typeof q === "string").slice(0, 8)
      : [];
    result.collections = Array.isArray(value.collections)
      ? value.collections
          .filter(
            (c) =>
              c &&
              typeof c.id === "string" &&
              typeof c.title === "string" &&
              Array.isArray(c.apps),
          )
          .slice(0, 100)
          .map((c) => ({
            ...c,
            description: typeof c.description === "string" ? c.description : "",
            apps: c.apps.filter(isApp).slice(0, 20),
          }))
      : [];
    result.theme = ["light", "dark", "system"].includes(value.theme)
      ? value.theme
      : "system";
    return result;
  } catch {
    return initial();
  }
}
export let state = read();
export function isLibraryCurrent() {
  try {
    return localStorage.getItem(key) === persisted;
  } catch {
    return false;
  }
}
export function save(notify = true) {
  try {
    if (localStorage.getItem(key) !== persisted) {
      storageError = staleLibraryMessage;
      window.dispatchEvent(new Event("playqr:storage-conflict"));
      return false;
    }
    const next = JSON.stringify(state);
    localStorage.setItem(key, next);
    persisted = next;
    storageError = "";
    if (notify) window.dispatchEvent(new Event("playqr:library"));
    return true;
  } catch {
    storageError =
      "Could not save on this device. Browser storage may be full or unavailable. Your previous saved library is unchanged.";
    return false;
  }
}
export function switchLibrary(userId) {
  key = userId ? "playqr-library-v3:" + userId : "playqr-library-v2";
  persisted = storedValue(key);
  storageError = "";
  state = read();
}
export function replaceCloud(data) {
  const previous = {
    favorites: state.favorites,
    collections: state.collections,
  };
  state.favorites = data?.favorites || [];
  state.collections = data?.collections || [];
  if (save(false)) return true;
  Object.assign(state, previous);
  return false;
}
export const guestLibrary = () => read("playqr-library-v2");
export function remember(app) {
  const previous = state.recent;
  state.recent = [app, ...state.recent.filter((a) => a.id !== app.id)].slice(
    0,
    24,
  );
  if (save()) return true;
  state.recent = previous;
  return false;
}
export function favorite(app) {
  const previous = state.favorites;
  const has = state.favorites.some((a) => a.id === app.id);
  if (!has && previous.length >= 100)
    throw new Error(
      "Your library has 100 saved apps. Remove one before adding another; your existing favorites are unchanged.",
    );
  state.favorites = has
    ? state.favorites.filter((a) => a.id !== app.id)
    : [app, ...state.favorites];
  if (!save()) {
    state.favorites = previous;
    throw new Error(storageError);
  }
  return !has;
}
export function ownerKey() {
  try {
    let value = localStorage.getItem("playqr-owner");
    if (!/^[a-f0-9]{64}$/.test(value || "")) {
      value = [...crypto.getRandomValues(new Uint8Array(32))]
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
      localStorage.setItem("playqr-owner", value);
    }
    return value;
  } catch {
    throw new Error(
      "Shared-link management needs browser storage. Allow storage for PlayQR or sign in; direct store QR codes still work.",
    );
  }
}
window.addEventListener("storage", (event) => {
  if (
    (event.key === key || event.key === null) &&
    storedValue(key) !== persisted
  ) {
    storageError = staleLibraryMessage;
    window.dispatchEvent(new Event("playqr:storage-conflict"));
  }
});
