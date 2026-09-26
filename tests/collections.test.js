import test from "node:test";
import assert from "node:assert/strict";
import { reorderApps, duplicateCollection } from "../shared/collections.js";
test("reordering preserves every app without mutating the original array", () => {
  const apps = [{ id: "com.one" }, { id: "com.two" }, { id: "com.three" }];
  assert.deepEqual(
    reorderApps(apps, 1, -1).map((a) => a.id),
    ["com.two", "com.one", "com.three"],
  );
  assert.deepEqual(
    reorderApps(apps, 1, 1).map((a) => a.id),
    ["com.one", "com.three", "com.two"],
  );
  for (const [index, direction] of [
    [0, -1],
    [2, 1],
    [-1, 1],
    [1, 8],
  ])
    assert.deepEqual(reorderApps(apps, index, direction), apps);
  assert.equal(apps[0].id, "com.one");
});
test("duplicates receive independent draft identity and editable app metadata", () => {
  const source = {
    id: "old",
    title: "x".repeat(80),
    description: "My apps",
    apps: [{ id: "com.one", title: "One" }],
    code: "published-code",
  };
  const copy = duplicateCollection(source, "new");
  assert.equal(copy.id, "new");
  assert.equal(copy.title.length, 80);
  assert.equal(copy.code, undefined);
  copy.apps[0].title = "Changed";
  copy.apps.push({ id: "com.two" });
  assert.equal(source.apps[0].title, "One");
  assert.equal(source.apps.length, 1);
});

