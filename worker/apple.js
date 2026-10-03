import {
  imageUrl,
  isIOS,
  storeUrl,
  text,
  parseStoreUrl,
} from "../shared/domain.js";
import {
  appleSearchUrl,
  appleLookupUrl,
  appleResults,
} from "../shared/apple.js";
export { normalizeApple } from "../shared/apple.js";
async function appleRequest(url, ttl) {
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
  const apps = appleResults(data);
  await caches.default.put(
    key,
    Response.json(apps, {
      headers: { "Cache-Control": "public, max-age=" + ttl },
    }),
  );
  return apps;
}
export const searchApple = async (query) => ({
  apps: await appleRequest(appleSearchUrl(query), 300),
});
export async function getApple(id) {
  if (!isIOS(id))
    throw Object.assign(new Error("Invalid App Store ID."), { status: 400 });
  const key = new Request("https://playqr-cache.invalid/apple/app/v2/" + id);
  const hit = await caches.default.match(key);
  if (hit) return hit.json();
  let app;
  try {
    const apps = await appleRequest(appleLookupUrl(id), 21600);
    app = apps.find((a) => a.id === id);
  } catch {
    // Apple's shared-IP rate limits can affect Workers. Use the official listing,
    // not client-supplied titles/icons, when validating and rendering shared links.
    app = await getAppleListing(id);
  }
  if (!app)
    throw Object.assign(
      new Error("This app is not available in the US App Store."),
      { status: 404 },
    );
  await caches.default.put(
    key,
    Response.json(app, {
      headers: { "Cache-Control": "public, max-age=21600" },
    }),
  );
  return app;
}

export function extractAppleListing(objects, id, canonical) {
  if (!isIOS(id) || parseStoreUrl(canonical)?.id !== id) return null;
  const queue = objects.flatMap((o) => (Array.isArray(o) ? o : [o]));
  let data;
  while (queue.length) {
    const item = queue.shift();
    if (!item || typeof item !== "object") continue;
    if ([].concat(item["@type"] || []).includes("SoftwareApplication")) {
      data = item;
      break;
    }
    if (Array.isArray(item["@graph"])) queue.push(...item["@graph"]);
  }
  if (!text(data?.name, 160)) return null;
  const offer = Array.isArray(data.offers) ? data.offers[0] : data.offers;
  const image = imageUrl(
    typeof data.image === "object" ? data.image?.url : data.image,
  );
  // Request a square rendering of the same Apple-hosted icon asset, not its
  // wide social-preview crop. Never synthesize substitute app artwork.
  const icon = image.replace(
    /\/\d+x\d+[a-z0-9-]*\.(png|jpg|webp)$/i,
    "/512x512bb.webp",
  );
  const rating = Number(data.aggregateRating?.ratingValue);
  const reviews = Number(
    data.aggregateRating?.ratingCount || data.aggregateRating?.reviewCount,
  );
  return {
    id,
    platform: "ios",
    url: storeUrl(id),
    title: text(data.name, 160),
    developer: text(data.author?.name || data.publisher?.name, 160),
    icon,
    description: text(data.description, 5000),
    category: text(
      Array.isArray(data.genre) ? data.genre[0] : data.applicationCategory,
      80,
    ),
    rating: rating > 0 && rating <= 5 ? rating : null,
    reviews: Number.isFinite(reviews) && reviews > 0 ? reviews : null,
    price: offer?.price != null ? text(String(offer.price), 20) : null,
    currency: text(offer?.priceCurrency, 8),
  };
}

async function getAppleListing(id) {
  const response = await fetch(storeUrl(id), {
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok)
    throw Object.assign(
      new Error("App Store listing is temporarily unavailable."),
      { status: response.status === 404 ? 404 : 502 },
    );
  const objects = [];
  let canonical = "",
    buffer = "";
  const parsed = new HTMLRewriter()
    .on('link[rel="canonical"]', {
      element(el) {
        canonical = el.getAttribute("href") || "";
      },
    })
    .on('script[type="application/ld+json"]', {
      element(el) {
        buffer = "";
        el.onEndTag(() => {
          try {
            objects.push(JSON.parse(buffer));
          } catch {
            /* fail closed below */
          }
        });
      },
      text(chunk) {
        buffer += chunk.text.slice(0, Math.max(0, 100000 - buffer.length));
      },
    })
    .transform(response);
  await parsed.body.pipeTo(new WritableStream());
  const app = extractAppleListing(objects, id, canonical);
  if (!app)
    throw Object.assign(
      new Error("App Store listing could not be verified. Please retry."),
      { status: 502 },
    );
  return app;
}

