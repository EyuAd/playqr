import {
  validAppId,
  isIOS,
  validateCollection,
  text,
  deviceCategory,
  browserCategory,
  smartDestination,
} from "../shared/domain.js";
import { getApp, searchApps } from "./metadata.js";
import { getApple, searchApple } from "./apple.js";
import { authConfig, resolveOwner, accountOwner } from "./auth.js";
import { accounts } from "./accounts.js";
import { curate } from "../shared/curation.js";
const getStoreApp = (id) => (isIOS(id) ? getApple(id) : getApp(id));

const DEFAULT_SITE = "https://eyuad.github.io/playqr/";
function unpack(row) {
  return {
    ...row,
    ids: JSON.parse(row.ids),
    presentation: JSON.parse(row.presentation || "{}"),
    owner_hash: undefined,
  };
}
async function body(request, limit = 16000) {
  if (!request.headers.get("Content-Type")?.startsWith("application/json"))
    throw Object.assign(new Error("Expected JSON."), { status: 415 });
  const reader = request.body?.getReader();
  if (!reader)
    throw Object.assign(new Error("Missing request body."), { status: 400 });
  let total = 0,
    value = "";
  const decoder = new TextDecoder();
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    total += chunk.value.length;
    if (total > limit) {
      await reader.cancel();
      throw Object.assign(new Error("Request is too large."), { status: 413 });
    }
    value += decoder.decode(chunk.value, { stream: true });
  }
  try {
    return JSON.parse(value + decoder.decode());
  } catch {
    throw Object.assign(new Error("Invalid JSON."), { status: 400 });
  }
}
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url),
      site = env.FRONTEND_URL || DEFAULT_SITE;
    const origin = request.headers.get("Origin"),
      allowed = new URL(site).origin;
    const allowedOrigins = new Set([
      allowed,
      ...(env.ADDITIONAL_FRONTEND_ORIGINS || "")
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.startsWith("https://")),
    ]);
    if (env.ENVIRONMENT === "development")
      allowedOrigins.add("http://127.0.0.1:5173");
    const cors = {
      "Access-Control-Allow-Origin": allowedOrigins.has(origin)
        ? origin
        : allowed,
      Vary: "Origin",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
    };
    const json = (value, status = 200) =>
      Response.json(value, { status, headers: cors });
    if (request.method === "OPTIONS")
      return new Response(null, { headers: cors });
    try {
      if (
        !["GET", "POST", "HEAD", "PATCH", "DELETE"].includes(request.method) ||
        (["PATCH", "DELETE"].includes(request.method) &&
          !/^\/links\/[a-f0-9]{16}$/.test(url.pathname))
      )
        return json({ error: "Method not allowed." }, 405);
      if (
        env.RATE_LIMITER &&
        !(
          await env.RATE_LIMITER.limit({
            key: request.headers.get("CF-Connecting-IP") || "local",
          })
        ).success
      )
        return new Response(
          JSON.stringify({
            error: "Too many requests. Try again in a minute.",
          }),
          {
            status: 429,
            headers: {
              ...cors,
              "Content-Type": "application/json",
              "Retry-After": "60",
            },
          },
        );
      if (url.pathname === "/health")
        return json({
          ok: true,
          version: 4,
          sharing: Boolean(env.DB),
          accounts: authConfig(env).enabled,
        });
      if (url.pathname === "/auth/config" && request.method === "GET")
        return json(authConfig(env));
      if (url.pathname === "/search" && request.method === "GET") {
        const q = text(url.searchParams.get("q"), 121);
        if (q.length < 2 || q.length > 120)
          return json({ error: "Enter between 2 and 120 characters." }, 400);
        const store = url.searchParams.get("store") || "android";
        if (!["android", "ios", "all"].includes(store))
          return json({ error: "Choose a valid app store." }, 400);
        if (store === "android") return json(await searchApps(q));
        if (store === "ios") return json(await searchApple(q));
        const results = await Promise.allSettled([
          searchApps(q),
          searchApple(q),
        ]);
        if (results.every((r) => r.status === "rejected"))
          throw Object.assign(
            new Error("Both stores are temporarily unavailable."),
            { status: 502 },
          );
        return json({
          apps: results.flatMap((r) =>
            r.status === "fulfilled" ? r.value.apps : [],
          ),
          warning: results.some((r) => r.status === "rejected")
            ? "One store is temporarily unavailable. Showing results from the other store."
            : null,
        });
      }
      if (url.pathname === "/app" && request.method === "GET") {
        const id = url.searchParams.get("id");
        if (!validAppId(id)) return json({ error: "Invalid app ID." }, 400);
        return json({ app: await getStoreApp(id) });
      }
      if (!env.DB)
        return json(
          {
            error:
              "Sharing is temporarily unavailable. Direct store QR codes still work.",
          },
          503,
        );
      if (
        url.pathname.startsWith("/account/") ||
        url.pathname.startsWith("/profiles/")
      ) {
        const response = await accounts(request, env, json, body);
        if (response) return response;
      }
      if (url.pathname === "/links" && request.method === "POST") {
        const owner = await resolveOwner(request, env);
        const input = await body(request);
        if (!input || typeof input !== "object" || Array.isArray(input))
          return json({ error: "Expected a share object." }, 400);
        let item;
        if (input.kind === "app") {
          if (!validAppId(input.id))
            return json({ error: "Invalid app ID." }, 400);
          if (
            input.pairedId &&
            (!validAppId(input.pairedId) ||
              isIOS(input.id) === isIOS(input.pairedId) ||
              input.confirmedPair !== true)
          )
            return json(
              { error: "Confirm a matching app from the other store." },
              400,
            );
          const app = await getStoreApp(input.id);
          item = { title: app.title, description: "", ids: [app.id] };
          if (input.pairedId) {
            await getStoreApp(input.pairedId);
            item.ids.push(input.pairedId);
          }
        } else if (input.kind === "collection") {
          try {
            item = validateCollection(input);
          } catch (e) {
            return json({ error: e.message }, 400);
          }
        } else return json({ error: "Unknown share type." }, 400);
        const presentation =
          input.kind === "collection" ? curate(input, item.ids) : {};
        const listed = input.kind === "collection" && input.listed === true;
        if (listed) {
          await accountOwner(request, env);
          if (
            !(await env.DB.prepare(
              "SELECT handle FROM profiles WHERE owner_hash = ?",
            )
              .bind(owner)
              .first())
          )
            return json(
              {
                error:
                  "Create your public profile before listing a collection.",
              },
              400,
            );
        }
        const code = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
        const inserted = await env.DB.prepare(
          "INSERT INTO links(code,owner_hash,kind,title,description,ids,presentation,listed) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM links WHERE owner_hash = ?) < 200",
        )
          .bind(
            code,
            owner,
            input.kind,
            item.title,
            item.description,
            JSON.stringify(item.ids),
            JSON.stringify(presentation),
            listed ? 1 : 0,
            owner,
          )
          .run();
        if (!inserted.meta.changes)
          return json(
            {
              error: "This browser has reached its limit of 200 shared links.",
            },
            409,
          );
        return json(
          { code, kind: input.kind, ...item, url: url.origin + "/a/" + code },
          201,
        );
      }
      if (url.pathname === "/library" && request.method === "GET") {
        const owner = await resolveOwner(request, env);
        const { results } = await env.DB.prepare(
          "SELECT * FROM links WHERE owner_hash = ? ORDER BY created_at DESC LIMIT 200",
        )
          .bind(owner)
          .all();
        return json({ links: results.map(unpack) });
      }
      const match = url.pathname.match(
        /^\/(a|links|analytics)\/([a-f0-9]{16})$/,
      );
      if (
        match?.[1] === "links" &&
        ["PATCH", "DELETE"].includes(request.method)
      ) {
        const owner = await resolveOwner(request, env),
          code = match[2];
        const owned = await env.DB.prepare(
          "SELECT code FROM links WHERE code = ? AND owner_hash = ?",
        )
          .bind(code, owner)
          .first();
        if (!owned)
          return json(
            { error: "This link was not found in your browser library." },
            404,
          );
        if (request.method === "DELETE") {
          await env.DB.prepare(
            "DELETE FROM links WHERE code = ? AND owner_hash = ?",
          )
            .bind(code, owner)
            .run();
          return json({ revoked: true });
        }
        const input = await body(request);
        if (
          !input ||
          typeof input.title !== "string" ||
          !input.title.trim() ||
          input.title.trim().length > 80 ||
          Object.keys(input).some((key) => key !== "title")
        )
          return json(
            { error: "Provide only a title between 1 and 80 characters." },
            400,
          );
        const title = text(input.title, 80);
        if (!title) return json({ error: "Give this link a title." }, 400);
        const result = await env.DB.prepare(
          "UPDATE links SET title = ? WHERE code = ? AND owner_hash = ?",
        )
          .bind(title, code, owner)
          .run();
        if (!result.meta.changes)
          return json({ error: "This link is no longer available." }, 404);
        return json({ code, title });
      }
      if (match && ["GET", "HEAD"].includes(request.method)) {
        const row = await env.DB.prepare("SELECT * FROM links WHERE code = ?")
          .bind(match[2])
          .first();
        if (!row)
          return json({ error: "This shared link could not be found." }, 404);
        const link = unpack(row);
        if (match[1] === "a") {
          const ua = request.headers.get("User-Agent") || "";
          if (
            request.method === "GET" &&
            request.headers.get("DNT") !== "1" &&
            request.headers.get("Sec-GPC") !== "1" &&
            !/bot|crawler|spider|preview|facebookexternalhit/i.test(ua) &&
            !/prefetch/i.test(
              request.headers.get("Purpose") ||
                request.headers.get("Sec-Purpose") ||
                "",
            )
          ) {
            const day = new Date().toISOString().slice(0, 10);
            const country = /^[A-Z]{2}$/.test(request.cf?.country || "")
              ? request.cf.country
              : "Unknown";
            ctx.waitUntil(
              env.DB.batch([
                env.DB.prepare(
                  "UPDATE links SET total = total + 1, last_scanned = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE code = ?",
                ).bind(link.code),
                env.DB.prepare(
                  "INSERT INTO scan_daily(code,day,device,browser,country,count) VALUES(?,?,?,?,?,1) ON CONFLICT(code,day,device,browser,country) DO UPDATE SET count = count + 1",
                ).bind(
                  link.code,
                  day,
                  deviceCategory(ua),
                  browserCategory(ua),
                  country,
                ),
              ]).catch(() => console.error("analytics_write_failed")),
            );
          }
          return new Response(null, {
            status: 302,
            headers: {
              Location: smartDestination(link, ua, site),
              "Cache-Control": "no-store",
              "Referrer-Policy": "no-referrer",
            },
          });
        }
        if (match[1] === "analytics") {
          if (row.owner_hash !== (await resolveOwner(request, env)))
            return json(
              { error: "This link belongs to another browser library." },
              403,
            );
          const range = ["7", "30", "all"].includes(
            url.searchParams.get("range"),
          )
            ? url.searchParams.get("range")
            : "7";
          const since =
            range === "all"
              ? "0000-00-00"
              : new Date(Date.now() - (Number(range) - 1) * 86400000)
                  .toISOString()
                  .slice(0, 10);
          const { results } = await env.DB.prepare(
            "SELECT day, device, browser, country, count FROM scan_daily WHERE code = ? AND day >= ? ORDER BY day",
          )
            .bind(link.code, since)
            .all();
          return json({ link, rows: results, range });
        }
        const apps = [],
          results = [];
        for (let i = 0; i < link.ids.length; i += 4)
          results.push(
            ...(await Promise.allSettled(
              link.ids.slice(i, i + 4).map(getStoreApp),
            )),
          );
        for (const r of results)
          if (r.status === "fulfilled") apps.push(r.value);
        return json({
          link: {
            code: link.code,
            kind: link.kind,
            title: link.title,
            description: link.description,
            ids: link.ids,
            created_at: link.created_at,
            presentation: link.presentation,
          },
          apps,
          unavailable: results.filter((r) => r.status === "rejected").length,
        });
      }
      return json({ error: "Not found." }, 404);
    } catch (error) {
      const status =
        error.status || (error.name === "TimeoutError" ? 504 : 500);
      console.error(
        JSON.stringify({ event: "request_failed", status, path: url.pathname }),
      );
      return json(
        {
          error:
            status < 500
              ? error.message
              : status === 504
                ? "The upstream service took too long. Please try again."
                : "The service is temporarily unavailable. Please retry.",
        },
        status,
      );
    }
  },
};
