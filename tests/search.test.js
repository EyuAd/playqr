import test from "node:test";
import assert from "node:assert/strict";
import { searchResult } from "../worker/metadata.js";
test("partial search results preserve store order and report missing metadata", () => {
  const first = { id: "com.takecare.mobile" },
    second = { id: "com.marriott.mrt" };
  assert.deepEqual(
    searchResult([
      { status: "fulfilled", value: first },
      { status: "fulfilled", value: second },
    ]),
    { apps: [first, second] },
  );
  const partial = searchResult([
    { status: "rejected", reason: new Error("timeout") },
    { status: "fulfilled", value: second },
  ]);
  assert.deepEqual(partial.apps, [second]);
  assert.match(partial.warning, /retry missing results/);
  assert.deepEqual(searchResult([]), { apps: [] });
});
