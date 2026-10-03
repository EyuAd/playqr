import { imageUrl, isIOS, storeUrl, text } from "./domain.js";

export function normalizeApple(app) {
  const id = "ios:" + app?.trackId;
  const title = text(app?.trackName, 160);
  if (!isIOS(id) || app?.wrapperType !== "software" || !title) return null;
  return {
    id,
    platform: "ios",
    url: storeUrl(id),
    title,
    developer: text(app.sellerName || app.artistName, 160),
    icon: imageUrl(app.artworkUrl512 || app.artworkUrl100),
    description: text(app.description, 5000),
    category: text(app.primaryGenreName, 80),
    rating:
      app.averageUserRating > 0 && app.averageUserRating <= 5
        ? Number(app.averageUserRating)
        : null,
    reviews:
      Number.isFinite(Number(app.userRatingCount)) && app.userRatingCount > 0
        ? Number(app.userRatingCount)
        : null,
    price:
      Number.isFinite(app.price) && app.price >= 0 ? String(app.price) : null,
    currency: text(app.currency, 8),
  };
}

export function appleSearchUrl(query) {
  const term = text(query, 121);
  if (term.length < 2 || term.length > 120)
    throw new Error("Enter between 2 and 120 characters.");
  const params = new URLSearchParams({
    term,
    country: "us",
    media: "software",
    entity: "software",
    limit: "6",
  });
  return "https://itunes.apple.com/search?" + params;
}

export function appleLookupUrl(id) {
  if (!isIOS(id)) throw new Error("Invalid App Store ID.");
  return (
    "https://itunes.apple.com/lookup?" +
    new URLSearchParams({ id: id.slice(4), country: "us", entity: "software" })
  );
}

export function appleResults(data) {
  if (!Array.isArray(data?.results))
    throw new Error("App Store returned unreadable results. Please retry.");
  return data.results.map(normalizeApple).filter(Boolean);
}

