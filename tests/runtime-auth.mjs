import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import assert from "node:assert/strict";
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    scriptPath: "worker/worker-build/worker.js",
    compatibilityDate: "2026-09-15",
    d1Databases: { DB: "runtime-auth-test" },
    bindings: {
      SUPABASE_URL: "https://fixture.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
    },
    outboundService: async (req) => {
      assert.equal(req.url, "https://fixture.supabase.co/auth/v1/user");
      return Response.json({
        id: "11111111-1111-4111-8111-111111111111",
        email: "test@example.com",
        email_confirmed_at: "2026-10-02T00:00:00Z",
        aud: "authenticated",
        role: "authenticated",
        app_metadata: {},
        user_metadata: {},
        created_at: "2026-10-02T00:00:00Z",
      });
    },
  }),
);
try {
  const DB = await mf.getD1Database("DB");
  await DB.prepare(
    "CREATE TABLE libraries(owner_hash TEXT PRIMARY KEY,data TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1)",
  ).run();
  const result = await mf.dispatchFetch(
    "https://test.example/account/library",
    { headers: { Authorization: "Bearer fixture.valid.token" } },
  );
  assert.equal(result.status, 200, await result.clone().text());
  assert.deepEqual(await result.json(), { data: null, revision: 0 });
  console.log(
    "PASS: bundled Worker authenticates through mocked Supabase in the real workerd runtime",
  );
} finally {
  await mf.dispose();
}
