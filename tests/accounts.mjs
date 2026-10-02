import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import worker from "../worker/worker.js";

const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    script: 'export default {fetch(){return new Response("test")}}',
    compatibilityDate: "2026-09-15",
    d1Databases: { DB: "accounts-isolated-test" },
  }),
);
const DB = await mf.getD1Database("DB");
for (const file of ["0001_sharing.sql", "0002_accounts_curation.sql"]) {
  const sql = await readFile(
    new URL("../worker/migrations/" + file, import.meta.url),
    "utf8",
  );
  for (const statement of sql.split(";").filter((s) => s.trim()))
    await DB.prepare(statement).run();
}
const env = {
  DB,
  SUPABASE_URL: "https://fixture.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
};
const originalFetch = globalThis.fetch;
// Isolated identity provider fixture: production auth is never bypassed.
globalThis.fetch = async (url, options) => {
  assert.equal(String(url), "https://fixture.supabase.co/auth/v1/user");
  const token = new Headers(options.headers).get("authorization");
  if (
    ![
      "Bearer fixture.a.token",
      "Bearer fixture.b.token",
      "Bearer fixture.unconfirmed.token",
    ].includes(token)
  )
    return Response.json({ message: "Invalid JWT" }, { status: 401 });
  return Response.json({
    id:
      token === "Bearer fixture.b.token"
        ? "22222222-2222-4222-8222-222222222222"
        : "11111111-1111-4111-8111-111111111111",
    email: "test@example.com",
    email_confirmed_at: token.includes("unconfirmed")
      ? null
      : "2026-10-02T00:00:00Z",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-10-02T00:00:00Z",
  });
};
const call = (path, token = "fixture.a.token", method = "GET", data) =>
  worker.fetch(
    new Request("https://api.example.com" + path, {
      method,
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    }),
    env,
    { waitUntil() {} },
  );
try {
  assert.equal((await call("/account/library", "forged.a.token")).status, 401);
  assert.equal(
    (await call("/account/library", "fixture.unconfirmed.token")).status,
    401,
  );
  assert.equal((await call("/account/library", "a".repeat(64))).status, 401);
  assert.deepEqual(await (await call("/account/library")).json(), {
    data: null,
    revision: 0,
  });
  const data = {
    favorites: [{ id: "ios:324684580", title: "Spotify" }],
    collections: [],
  };
  assert.equal(
    (
      await call("/account/library", "fixture.a.token", "POST", {
        revision: 0,
        data,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call("/account/library", "fixture.a.token", "POST", {
        revision: 0,
        data,
      })
    ).status,
    409,
  );
  const concurrent = await Promise.all(
    [1, 2].map(() =>
      call("/account/library", "fixture.a.token", "POST", {
        revision: 1,
        data,
      }),
    ),
  );
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    (await (await call("/account/library", "fixture.b.token")).json()).data,
    null,
  );
  assert.equal(
    (
      await call("/account/profile", "fixture.a.token", "POST", {
        handle: "curator-one",
        name: "Curator",
        bio: "Apps I love",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call("/account/profile", "fixture.b.token", "POST", {
        handle: "curator-one",
        name: "Other",
      })
    ).status,
    409,
  );
  const publicLink = await (
    await call("/links", "fixture.a.token", "POST", {
      kind: "collection",
      title: "Public kit",
      ids: ["ios:324684580"],
      listed: true,
      cover: "sunset",
      category: "Travel",
      notes: { "ios:324684580": "For the journey" },
    })
  ).json();
  await call("/links", "fixture.a.token", "POST", {
    kind: "collection",
    title: "Unlisted kit",
    ids: ["com.app"],
    listed: false,
  });
  const profile = await (await call("/profiles/curator-one")).json();
  assert.equal(profile.collections.length, 1);
  assert.equal(profile.collections[0].title, "Public kit");
  assert.equal(profile.profile.owner_hash, undefined);
  assert.equal(
    profile.collections[0].presentation.notes["ios:324684580"],
    "For the journey",
  );
  assert.equal(
    (await call("/links/" + publicLink.code, "fixture.b.token", "DELETE"))
      .status,
    404,
  );
  assert.equal(
    (await call("/analytics/" + publicLink.code, "fixture.b.token")).status,
    403,
  );
  const guest = "a".repeat(64);
  const guestLink = await (
    await call("/links", guest, "POST", {
      kind: "collection",
      title: "Guest kit",
      ids: ["com.app"],
    })
  ).json();
  const claimed = await (
    await call("/account/claim", "fixture.a.token", "POST", { guestKey: guest })
  ).json();
  assert.equal(claimed.imported, 1);
  assert.equal(
    (await call("/links/" + guestLink.code, guest, "DELETE")).status,
    404,
  );
  assert.equal(
    (await call("/links/" + guestLink.code, "fixture.a.token", "DELETE"))
      .status,
    200,
  );
  assert.equal(
    (await call("/links/" + publicLink.code, "fixture.a.token", "DELETE"))
      .status,
    200,
  );
  assert.equal(
    (await (await call("/profiles/curator-one")).json()).collections.length,
    0,
  );
  console.log(
    "PASS: real isolated D1 + mock identity provider: token verification, account isolation, revision conflicts, opt-in public profiles, guest ownership import, revocation",
  );
} finally {
  globalThis.fetch = originalFetch;
  await mf.dispose();
}
