import test from "node:test";
import assert from "node:assert/strict";
import {
  parseStoreUrl,
  storeUrl,
  validAppId,
  smartDestination,
  imageUrl,
  validateCollection,
} from "../shared/domain.js";
import { normalizeApple } from "../worker/apple.js";
import { curate } from "../shared/curation.js";
import { librarySnapshot } from "../shared/library.js";
import { authConfig } from "../worker/auth.js";

test("Apple IDs and URLs are namespaced, canonical and restricted to the real store", () => {
  assert.deepEqual(
    parseStoreUrl("https://apps.apple.com/gb/app/spotify/id324684580?mt=8"),
    { id: "ios:324684580", url: storeUrl("ios:324684580") },
  );
  for (const url of [
    "https://apps.apple.com.evil.test/us/app/id324684580",
    "https://evil@apps.apple.com/us/app/id324684580",
    "http://apps.apple.com/us/app/id324684580",
    "https://apps.apple.com/us/search/spotify",
    "https://apps.apple.com/us/app/id0000324684580",
  ])
    assert.equal(parseStoreUrl(url), null);
  assert.equal(validAppId("ios:324684580"), true);
  assert.equal(validAppId("324684580"), false);
  assert.equal(
    imageUrl("https://is1-ssl.mzstatic.com/icon.png"),
    "https://is1-ssl.mzstatic.com/icon.png",
  );
  assert.equal(imageUrl("https://is1-ssl.mzstatic.com.evil.test/icon.png"), "");
});
test("paired QR links route each platform correctly and retain a desktop fallback", () => {
  const link = {
      kind: "app",
      ids: ["com.spotify.music", "ios:324684580"],
      code: "abc",
    },
    site = "https://example.com/";
  assert.equal(
    smartDestination(link, "iPhone", site),
    storeUrl("ios:324684580"),
  );
  assert.equal(
    smartDestination(link, "Android", site),
    storeUrl("com.spotify.music"),
  );
  assert.equal(smartDestination(link, "Windows", site), site + "#share/abc");
  assert.equal(
    smartDestination({ ...link, ids: ["ios:324684580"] }, "Android", site),
    site + "#share/abc",
  );
  assert.equal(
    smartDestination({ ...link, kind: "collection" }, "iPhone", site),
    site + "#share/abc",
  );
});
test("Apple normalization preserves authentic artwork and rejects non-app records", () => {
  const app = normalizeApple({
    wrapperType: "software",
    trackId: 324684580,
    trackName: "Spotify",
    sellerName: "Spotify AB",
    artworkUrl512: "https://is1-ssl.mzstatic.com/icon.png",
    price: 0,
    currency: "USD",
    averageUserRating: 4.7,
    userRatingCount: 100,
  });
  assert.equal(app.id, "ios:324684580");
  assert.equal(app.price, "0");
  assert.equal(app.rating, 4.7);
  assert.ok(app.icon.endsWith("icon.png"));
  assert.equal(
    normalizeApple({
      wrapperType: "track",
      trackId: 324684580,
      trackName: "Song",
    }),
    null,
  );
});
test("mixed-store curation limits public notes to included apps", () => {
  assert.equal(
    validateCollection({ title: "Kit", ids: ["com.app", "ios:324684580"] }).ids
      .length,
    2,
  );
  assert.deepEqual(
    curate(
      {
        cover: "evil",
        category: "made up",
        notes: { "com.app": " Useful ", other: "private" },
      },
      ["com.app"],
    ),
    { cover: "forest", category: "Everyday", notes: { "com.app": "Useful" } },
  );
});
test("cloud library validation excludes credentials, history and arbitrary metadata", () => {
  const data = librarySnapshot({
    favorites: [
      {
        id: "ios:324684580",
        title: "Spotify",
        icon: "https://evil.test/x",
        token: "private",
      },
    ],
    collections: [],
    searches: ["private"],
    owner: "secret",
  });
  assert.deepEqual(Object.keys(data), ["favorites", "collections"]);
  assert.equal(data.favorites[0].icon, "");
  assert.equal(data.favorites[0].token, undefined);
  assert.throws(() =>
    librarySnapshot({
      favorites: [{ id: "bad", title: "Bad" }],
      collections: [],
    }),
  );
});
test("auth config only exposes a valid public project and publishable key", () => {
  assert.deepEqual(
    authConfig({
      AUTH_READY: "false",
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    }),
    { enabled: false },
  );
  assert.deepEqual(
    authConfig({
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_secret_test",
    }),
    { enabled: false },
  );
  assert.deepEqual(
    authConfig({
      SUPABASE_URL: "https://evil.test",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    }),
    { enabled: false },
  );
  assert.equal(
    authConfig({
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    }).enabled,
    true,
  );
});
