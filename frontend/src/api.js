import { ownerKey } from "./storage.js";
import { accessToken } from "./auth.js";
import { API } from "./config.js";
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
  const value = await request(
    "/search?v=5&store=" + store + "&q=" + encodeURIComponent(query),
    {
      signal,
    },
  );
  if (!value.warning) cache.set(key, { value, time: Date.now() });
  if (cache.size > 30) cache.delete(cache.keys().next().value);
  return value;
}
export async function appDetails(id, signal) {
  const key = "app:" + id,
    hit = cache.get(key);
  if (hit && Date.now() - hit.time < 300000) return hit.value;
  const value = await request("/app?id=" + encodeURIComponent(id), { signal });
  cache.set(key, { value, time: Date.now() });
  if (cache.size > 30) cache.delete(cache.keys().next().value);
  return value;
}
export const publish = (data) =>
  request("/links", { method: "POST", data, privateAccess: true });
