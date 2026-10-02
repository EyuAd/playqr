import { imageUrl, isIOS, storeUrl, text } from "../shared/domain.js";

export function normalizeApple(app) {
  const id = "ios:" + app.trackId;
  if (!isIOS(id) || app.wrapperType !== "software" || !app.trackName)
    return null;
  return {
    id,
    platform: "ios",
    url: storeUrl(id),
    title: text(app.trackName, 160),
    developer: text(app.sellerName || app.artistName, 160),
    icon: imageUrl(app.artworkUrl512 || app.artworkUrl100),
    description: text(app.description, 5000),
    category: text(app.primaryGenreName, 80),
    rating:
      app.averageUserRating > 0 && app.averageUserRating <= 5
        ? Number(app.averageUserRating)
        : null,
    reviews: app.userRatingCount > 0 ? Number(app.userRatingCount) : null,
    price:
      typeof app.price === "number" && app.price >= 0
        ? String(app.price)
        : null,
    currency: text(app.currency, 8),
  };
}
async function appleRequest(path, ttl) {
  const url = "https://itunes.apple.com/" + path;
  const key = new Request(url);
  const hit = await caches.default.match(key);
  if (hit) return hit.json();
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!response.ok)
    throw Object.assign(
      new Error("App Store search is temporarily unavailable."),
      { status: 502 },
    );
  const data = await response.json();
  if (!Array.isArray(data.results))
    throw Object.assign(new Error("App Store returned unreadable results."), {
      status: 502,
    });
  const apps = data.results.map(normalizeApple).filter(Boolean);
  await caches.default.put(
    key,
    Response.json(apps, {
      headers: { "Cache-Control": "public, max-age=" + ttl },
    }),
  );
  return apps;
}
export const searchApple = async (query) => ({
  apps: await appleRequest(
    `search?term=${encodeURIComponent(query)}&country=us&entity=software&limit=6`,
    300,
  ),
});
export async function getApple(id) {
  if (!isIOS(id))
    throw Object.assign(new Error("Invalid App Store ID."), { status: 400 });
  const apps = await appleRequest(
    `lookup?id=${id.slice(4)}&country=us&entity=software`,
    21600,
  );
  const app = apps.find((a) => a.id === id);
  if (!app)
    throw Object.assign(
      new Error("This app is not available in the US App Store."),
      { status: 404 },
    );
  return app;
}
