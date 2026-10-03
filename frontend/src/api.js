import { ownerKey } from "./storage.js";
import { accessToken } from "./auth.js";
import { API } from "./config.js";
import { isIOS, validAppId } from "../../shared/domain.js";
import { searchAppleBrowser, appleDetailsBrowser } from "./apple.js";
export { API };
const cache = new Map();
export async function request(
  path,
  { method = "GET", data, privateAccess = false, signal, bearerToken } = {},
) {
  const headers = {};
  if (privateAccess)
    headers.Authorization = `Bearer ${bearerToken || (await accessToken()) || ownerKey()}`;
  if (data) headers["Content-Type"] = "application/json";
  const response = await fetch(API + path, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(35000)])
      : AbortSignal.timeout(35000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "The request could not be completed.");
  return result;
}
export async function search(query, signal, store = "android") {
  const key = store + ":" + query.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < 300000) return hit.value;
  if (!["android", "ios", "all"].includes(store))
    throw new Error("Choose a valid app store.");
  const android = () =>
    request("/search?v=5&store=android&q=" + encodeURIComponent(query), {
      signal,
    });
  let value;
  if (store === "ios") value = await searchAppleBrowser(query, signal);
  else if (store === "android") value = await android();
  else {
    const results = await Promise.allSettled([
      android(),
      searchAppleBrowser(query, signal),
    ]);
    signal?.throwIfAborted();
    if (results.every((r) => r.status === "rejected"))
      throw new Error("Both stores are temporarily unavailable. Please retry.");
    const warnings = results
      .map((r, index) =>
        r.status === "rejected"
          ? (index === 0 ? "Google Play" : "App Store") +
            " is temporarily unavailable. Showing results from the other store."
          : r.value.warning,
      )
      .filter(Boolean);
    value = {
      apps: results.flatMap((r) =>
        r.status === "fulfilled" ? r.value.apps : [],
      ),
      ...(warnings.length ? { warning: warnings.join(" ") } : {}),
    };
  }
  if (!value.warning) cache.set(key, { value, time: Date.now() });
  if (cache.size > 30) cache.delete(cache.keys().next().value);
  return value;
}
export async function appDetails(id, signal) {
  if (!validAppId(id)) throw new Error("Invalid app ID.");
  const key = "app:" + id,
    hit = cache.get(key);
  if (hit && Date.now() - hit.time < 300000) return hit.value;
  let value;
  if (isIOS(id)) {
    try {
      value = await appleDetailsBrowser(id, signal);
    } catch (error) {
      signal?.throwIfAborted();
      if (error.status === 404) throw error;
      value = await request("/app?id=" + encodeURIComponent(id), { signal });
    }
  } else value = await request("/app?id=" + encodeURIComponent(id), { signal });
  cache.set(key, { value, time: Date.now() });
  if (cache.size > 30) cache.delete(cache.keys().next().value);
  return value;
}
export const publish = (data) =>
  request("/links", { method: "POST", data, privateAccess: true });

