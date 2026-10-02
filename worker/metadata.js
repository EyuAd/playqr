import { imageUrl, playUrl, text, validId } from "../shared/domain.js";
const UA = "Mozilla/5.0 (compatible; PlayQR/2.0)";
export function extractApp(objects, id, meta = {}) {
  const queue = objects.flatMap((o) => (Array.isArray(o) ? o : [o]));
  let app = {};
  while (queue.length) {
    const item = queue.shift();
    if (!item || typeof item !== "object") continue;
    if (
      []
        .concat(item["@type"] || [])
        .some((t) => ["SoftwareApplication", "MobileApplication"].includes(t))
    ) {
      app = item;
      break;
    }
    if (Array.isArray(item["@graph"])) queue.push(...item["@graph"]);
  }
  const rawImage = typeof app.image === "object" ? app.image?.url : app.image;
  const rating = Number(app.aggregateRating?.ratingValue),
    reviews = Number(
      app.aggregateRating?.ratingCount || app.aggregateRating?.reviewCount,
    );
  const offer = Array.isArray(app.offers) ? app.offers[0] : app.offers;
  return {
    id,
    url: playUrl(id),
    title:
      text(app.name || meta.title, 160).replace(
        / - Apps on Google Play$/,
        "",
      ) || id,
    developer: text(app.author?.name || app.publisher?.name, 160),
    icon: imageUrl(rawImage || meta.icon),
    description: text(app.description || meta.description, 5000),
    category: text(app.applicationCategory, 80),
    rating: rating > 0 && rating <= 5 ? rating : null,
    reviews: Number.isFinite(reviews) && reviews > 0 ? reviews : null,
    price: offer?.price != null ? text(String(offer.price), 20) : null,
    currency: text(offer?.priceCurrency, 8),
  };
}
async function drain(response) {
  await response.body.pipeTo(new WritableStream());
}
export async function getApp(id) {
  if (!validId(id))
    throw Object.assign(new Error("Invalid app ID."), { status: 400 });
  const key = new Request(`https://playqr-cache.invalid/app/v4/${id}`);
  const cached = await caches.default.match(key);
  if (cached) return cached.json();
  const response = await fetch(`${playUrl(id)}&hl=en&gl=US`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok)
    throw Object.assign(
      new Error(
        response.status === 404
          ? "This app is no longer available on Google Play."
          : "Google Play is temporarily unavailable.",
      ),
      { status: response.status === 404 ? 404 : 502 },
    );
  const objects = [],
    meta = {};
  let buffer = "";
  const parsed = new HTMLRewriter()
    .on('script[type="application/ld+json"]', {
      element(el) {
        buffer = "";
        el.onEndTag(() => {
          try {
            objects.push(JSON.parse(buffer));
          } catch {
            /* Metadata fallback below. */
          }
        });
      },
      text(chunk) {
        if (buffer.length < 100000) buffer += chunk.text;
      },
    })
    .on("meta", {
      element(el) {
        const name = el.getAttribute("property") || el.getAttribute("name");
        const content = el.getAttribute("content");
        if (name === "og:image") meta.icon = content;
        if (name === "og:title") meta.title = content;
        if (name === "og:description" || name === "description")
          meta.description = content;
      },
    })
    .transform(response);
  await drain(parsed);
  const app = extractApp(objects, id, meta);
  if (
    app.title === id ||
    app.title.includes("<!--") ||
    (!app.icon && !app.developer && !app.description)
  )
    throw Object.assign(
      new Error("App information could not be read. Try again later."),
      { status: 502 },
    );
  await caches.default.put(
    key,
    Response.json(app, {
      headers: { "Cache-Control": "public, max-age=21600" },
    }),
  );
  return app;
}
export async function searchApps(query) {
  const key = new Request(
    `https://playqr-cache.invalid/search/v5?q=${encodeURIComponent(query.toLowerCase())}`,
  );
  const cached = await caches.default.match(key);
  if (cached) return cached.json();
  const response = await fetch(
    `https://play.google.com/store/search?q=${encodeURIComponent(query)}&c=apps&hl=en&gl=US`,
    { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12000) },
  );
  if (!response.ok)
    throw Object.assign(
      new Error("Google Play search is temporarily unavailable."),
      { status: 502 },
    );
  const ids = new Set();
  await drain(
    new HTMLRewriter()
      .on('a[href*="/store/apps/details?id="]', {
        element(el) {
          try {
            const id = new URL(
              el.getAttribute("href"),
              "https://play.google.com",
            ).searchParams.get("id");
            if (validId(id) && ids.size < 6) ids.add(id);
          } catch {
            /* Ignore malformed upstream links. */
          }
        },
      })
      .transform(response),
  );
  const settled = [],
    list = [...ids];
  for (let i = 0; i < list.length; i += 6) {
    const results = await Promise.allSettled(list.slice(i, i + 6).map(getApp));
    settled.push(...results);
  }
  const result = searchResult(settled);
  if (ids.size && !result.apps.length)
    throw Object.assign(
      new Error("App details could not be loaded. Please retry."),
      { status: 502 },
    );
  // A transient metadata failure must not hide the best match for five minutes.
  if (!result.warning)
    await caches.default.put(
      key,
      Response.json(result, {
        headers: { "Cache-Control": "public, max-age=300" },
      }),
    );
  return result;
}

export function searchResult(settled) {
  const apps = settled
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value);
  return {
    apps,
    ...(settled.some((r) => r.status === "rejected")
      ? {
          warning:
            "Some Google Play listings could not load. Search again to retry missing results.",
        }
      : {}),
  };
}
