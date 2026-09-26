const key = "playqr-library-v2";
export const initial = () => ({
  favorites: [],
  recent: [],
  searches: [],
  collections: [],
  shares: [],
  theme: "system",
});
export function read() {
  try {
    const value = JSON.parse(localStorage.getItem(key)) || {},
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
export function save() {
  try {
    localStorage.setItem(key, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
export function remember(app) {
  state.recent = [app, ...state.recent.filter((a) => a.id !== app.id)].slice(
    0,
    24,
  );
  return save();
}
export function favorite(app) {
  const has = state.favorites.some((a) => a.id === app.id);
  state.favorites = has
    ? state.favorites.filter((a) => a.id !== app.id)
    : [app, ...state.favorites].slice(0, 100);
  save();
  return !has;
}
export function ownerKey() {
  let value = localStorage.getItem("playqr-owner");
  if (!/^[a-f0-9]{64}$/.test(value || "")) {
    value = [...crypto.getRandomValues(new Uint8Array(32))]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
    localStorage.setItem("playqr-owner", value);
  }
  return value;
}

