import assert from "node:assert/strict";
const api = "http://127.0.0.1:8787";
const token = crypto.randomUUID().replaceAll("-", "").repeat(2);
const headers = {
  "Content-Type": "application/json",
  Authorization: "Bearer " + token,
};
const created = await fetch(api + "/links", {
  method: "POST",
  headers,
  body: JSON.stringify({
    kind: "collection",
    title: "Integration verification",
    ids: ["com.spotify.music"],
  }),
});
assert.equal(created.status, 201);
const link = await created.json();
assert.match(link.code, /^[a-f0-9]{16}$/);
const missing = await fetch(api + "/analytics/" + link.code);
assert.equal(missing.status, 401);
const other = await fetch(api + "/analytics/" + link.code, {
  headers: { Authorization: "Bearer " + "b".repeat(64) },
});
assert.equal(other.status, 403);
for (const init of [
  { method: "HEAD" },
  { headers: { DNT: "1" } },
  { headers: { "Sec-GPC": "1" } },
  { headers: { "User-Agent": "previewbot" } },
  { headers: { Purpose: "prefetch" } },
]) {
  const response = await fetch(link.url, { ...init, redirect: "manual" });
  assert.equal(response.status, 302);
  assert.match(response.headers.get("Location"), /#share\//);
}
let data = await (
  await fetch(api + "/analytics/" + link.code, { headers })
).json();
assert.equal(data.link.total, 0);
await fetch(link.url, {
  redirect: "manual",
  headers: { "User-Agent": "Mozilla Android Chrome/120" },
});
for (let i = 0; i < 20; i++) {
  data = await (
    await fetch(api + "/analytics/" + link.code + "?range=all", { headers })
  ).json();
  if (data.link.total === 1) break;
  await new Promise((resolve) => setTimeout(resolve, 100));
}
assert.equal(data.link.total, 1);
assert.equal(
  data.rows.reduce((n, r) => n + r.count, 0),
  1,
);
assert.equal(data.rows[0].device, "Android");
const library = await (await fetch(api + "/library", { headers })).json();
assert.equal(library.links.length, 1);
assert.equal(library.links[0].owner_hash, undefined);
console.log(
  "PASS: real D1 publication, owner isolation, redirects, privacy opt-outs, daily aggregates, library",
);

