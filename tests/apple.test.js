import test from "node:test";
import assert from "node:assert/strict";
import {
  appleSearchUrl,
  appleLookupUrl,
  appleResults,
  normalizeApple,
} from "../shared/apple.js";
import { extractAppleListing, getApple } from "../worker/apple.js";

const id = "ios:324684580";
const canonical =
  "https://apps.apple.com/us/app/spotify-music-and-podcasts/id324684580";
const record = {
  wrapperType: "software",
  trackId: 324684580,
  trackName: "Spotify",
  artworkUrl512: "https://is1-ssl.mzstatic.com/icon.png",
};
const listing = {
  "@type": "SoftwareApplication",
  name: "Spotify: Music and Podcasts",
  image: "https://is1-ssl.mzstatic.com/image/thumb/AppIcon.png/1200x630wa.png",
  author: { name: "Spotify" },
  genre: ["Music", "Entertainment"],
  aggregateRating: { ratingValue: "4.8", reviewCount: "100" },
  offers: { price: 0, priceCurrency: "USD" },
};

test("Apple requests use fixed official hosts and software-only bounded search", () => {
  const url = new URL(appleSearchUrl("  Spotify & podcasts  "));
  assert.equal(url.origin + url.pathname, "https://itunes.apple.com/search");
  assert.equal(url.searchParams.get("term"), "Spotify & podcasts");
  assert.equal(url.searchParams.get("media"), "software");
  assert.equal(url.searchParams.get("entity"), "software");
  assert.equal(url.searchParams.get("country"), "us");
  assert.equal(url.searchParams.get("limit"), "6");
  assert.equal(new URL(appleLookupUrl(id)).searchParams.get("id"), "324684580");
  for (const query of ["", "a", "a".repeat(121), null])
    assert.throws(() => appleSearchUrl(query));
  for (const value of [
    "324684580",
    "ios:000324684580",
    "ios:324684580&url=https://evil.test",
    "com.spotify.music",
  ])
    assert.throws(() => appleLookupUrl(value));
});

test("Apple results reject non-app, malformed and empty-title records", () => {
  assert.deepEqual(
    appleResults({
      results: [
        null,
        {},
        { ...record, trackName: "  " },
        { ...record, wrapperType: "track" },
        record,
      ],
    }),
    [normalizeApple(record)],
  );
  for (const input of [null, {}, { results: {} }])
    assert.throws(() => appleResults(input));
  assert.deepEqual(appleResults({ results: [] }), []);
  const untrusted = normalizeApple({
    ...record,
    artworkUrl512: "https://evil.test/icon.png",
    userRatingCount: Infinity,
    price: Infinity,
  });
  assert.equal(untrusted.icon, "");
  assert.equal(untrusted.reviews, null);
  assert.equal(untrusted.price, null);
});

test("official listing fallback requires the exact canonical ID and real app metadata", () => {
  const app = extractAppleListing(
    [{ "@type": "Organization", name: "App Store" }, { "@graph": [listing] }],
    id,
    canonical,
  );
  assert.equal(app.id, id);
  assert.equal(app.url, "https://apps.apple.com/us/app/id324684580");
  assert.equal(app.title, listing.name);
  assert.equal(app.developer, "Spotify");
  assert.equal(app.category, "Music");
  assert.equal(app.price, "0");
  assert.equal(app.rating, 4.8);
  assert.equal(app.reviews, 100);
  assert.equal(
    app.icon,
    "https://is1-ssl.mzstatic.com/image/thumb/AppIcon.png/512x512bb.webp",
  );
  for (const url of [
    "",
    canonical.replace("324684580", "123456789"),
    canonical.replace("apps.apple.com", "apps.apple.com.evil.test"),
  ])
    assert.equal(extractAppleListing([listing], id, url), null);
  assert.equal(
    extractAppleListing(
      [{ "@type": "Organization", name: "App Store" }],
      id,
      canonical,
    ),
    null,
  );
  assert.equal(
    extractAppleListing([{ ...listing, name: " " }], id, canonical),
    null,
  );
  assert.equal(
    extractAppleListing(
      [{ ...listing, image: "https://evil.test/icon.png" }],
      id,
      canonical,
    ).icon,
    "",
  );
});

test("Worker lookup verifies the exact ID, caches metadata, and rejects unavailable IDs", async (t) => {
  const saved = new Map();
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ results: [record] }),
  );
  const previous = Object.getOwnPropertyDescriptor(globalThis, "caches");
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "caches", previous);
    else delete globalThis.caches;
  });
  globalThis.caches = {
    default: {
      async match(key) {
        return saved.get(key.url)?.clone();
      },
      async put(key, value) {
        saved.set(key.url, value.clone());
      },
    },
  };
  assert.equal((await getApple(id)).title, "Spotify");
  assert.equal((await getApple(id)).id, id);
  assert.equal(globalThis.fetch.mock.callCount(), 1);
  await assert.rejects(getApple("ios:123456789"), { status: 404 });
  await assert.rejects(getApple("https://evil.test"), { status: 400 });
});

