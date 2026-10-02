import test from "node:test";
import assert from "node:assert/strict";
import {
  createBackup,
  parseBackup,
  mergeBackup,
  MAX_BACKUP_BYTES,
} from "../shared/backup.js";
const app = {
  id: "com.spotify.music",
  title: "Spotify",
  developer: "Spotify AB",
};
const id = "11111111-1111-4111-8111-111111111111";
const draft = { id, title: "My setup", description: "", apps: [app] };
const library = { favorites: [app], collections: [draft] };
test("backups include validated library content but never credentials or browsing history", () => {
  const backup = createBackup({
    ...library,
    token: "secret",
    owner: "private",
    recent: [app],
    searches: ["private"],
  });
  assert.deepEqual(Object.keys(backup.library), ["favorites", "collections"]);
  assert.equal(JSON.stringify(backup).includes("secret"), false);
  assert.deepEqual(parseBackup(JSON.stringify(backup)), backup.library);
});
test("backup parser rejects invalid formats, IDs, malformed files and oversized input", () => {
  for (const value of [
    "{",
    "{}",
    JSON.stringify({ ...createBackup(library), version: 2 }),
    " ".repeat(MAX_BACKUP_BYTES + 1),
  ])
    assert.throws(() => parseBackup(value));
  assert.throws(() =>
    createBackup({
      favorites: [{ id: "https://evil.example", title: "bad" }],
      collections: [],
    }),
  );
});
test("merge preserves existing favorites and conflicting drafts without duplicates on reimport", () => {
  const incoming = {
    favorites: [
      { ...app, title: "Changed title" },
      { id: "ios:324684580", title: "Spotify iOS" },
    ],
    collections: [{ ...draft, title: "Different setup" }],
  };
  const merged = mergeBackup(
    library,
    incoming,
    () => "22222222-2222-4222-8222-222222222222",
  );
  assert.equal(merged.favorites[0].title, "Spotify");
  assert.equal(merged.favorites.length, 2);
  assert.equal(merged.collections.length, 2);
  assert.equal(merged.collections[0].title, "My setup");
  assert.notEqual(merged.collections[1].id, id);
  assert.deepEqual(mergeBackup(merged, incoming), merged);
  assert.equal(library.collections.length, 1);
});
test("imports exceeding library limits fail without truncating data", () => {
  const full = {
    favorites: Array.from({ length: 100 }, (_, i) => ({
      id: `com.example.app${i}`,
      title: `App ${i}`,
    })),
    collections: [],
  };
  assert.throws(() => mergeBackup(full, library), /exceed/);
  assert.equal(full.favorites.length, 100);
});
