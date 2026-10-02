import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/worker.js";
const call = (path, init = {}, env = {}) =>
  worker.fetch(new Request("https://api.example.com" + path, init), env, {
    waitUntil() {},
  });
test("API validates methods, query lengths, IDs and missing database", async () => {
  assert.equal((await call("/search?q=a")).status, 400);
  assert.equal((await call("/app?id=bad")).status, 400);
  assert.equal((await call("/links", { method: "DELETE" })).status, 405);
  assert.equal((await call("/links", { method: "POST" })).status, 503);
  assert.equal((await call("/library", {}, { DB: {} })).status, 401);
});
test("API enforces rate limits with retry information", async () => {
  const response = await call(
    "/search?q=test",
    {},
    { RATE_LIMITER: { limit: async () => ({ success: false }) } },
  );
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "60");
});
test("API validates collection payload before database writes", async () => {
  const headers = {
    "Content-Type": "application/json",
    Authorization: "Bearer " + "a".repeat(64),
  };
  assert.equal(
    (await call("/links", { method: "POST", headers, body: "{" }, { DB: {} }))
      .status,
    400,
  );
  assert.equal(
    (
      await call(
        "/links",
        {
          method: "POST",
          headers,
          body: JSON.stringify({ kind: "collection", title: "x", ids: [] }),
        },
        { DB: {} },
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "/links",
        { method: "POST", headers, body: "x".repeat(16001) },
        { DB: {} },
      )
    ).status,
    413,
  );
});
test("untrusted origins are not reflected in CORS", async () => {
  const response = await call("/health", {
    headers: { Origin: "https://evil.test" },
  });
  assert.equal(
    response.headers.get("Access-Control-Allow-Origin"),
    "https://eyuad.github.io",
  );
});

test("domain migration accepts only explicitly configured HTTPS origins", async () => {
  const env = {
    FRONTEND_URL: "https://eyuad.github.io/playqr/",
    ADDITIONAL_FRONTEND_ORIGINS:
      " https://eyubuilds.tech,https://www.eyubuilds.tech,http://insecure.test,* ",
  };
  for (const origin of [
    "https://eyuad.github.io",
    "https://eyubuilds.tech",
    "https://www.eyubuilds.tech",
  ]) {
    for (const method of ["GET", "OPTIONS"]) {
      const response = await call(
        "/health",
        { method, headers: { Origin: origin } },
        env,
      );
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
      assert.equal(response.headers.get("Vary"), "Origin");
    }
  }
  for (const origin of [
    "https://eyubuilds.tech.evil.test",
    "https://other.eyubuilds.tech",
    "http://eyubuilds.tech",
    "http://insecure.test",
    "http://127.0.0.1:5173",
    "null",
  ]) {
    const response = await call(
      "/health",
      { headers: { Origin: origin } },
      env,
    );
    assert.equal(
      response.headers.get("Access-Control-Allow-Origin"),
      "https://eyuad.github.io",
    );
  }
});

test("local browser access remains development-only", async () => {
  const response = await call(
    "/health",
    { headers: { Origin: "http://127.0.0.1:5173" } },
    { ENVIRONMENT: "development" },
  );
  assert.equal(
    response.headers.get("Access-Control-Allow-Origin"),
    "http://127.0.0.1:5173",
  );
});
