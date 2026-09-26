import { ownerKey } from "./storage.js";
export const API = (
  import.meta.env.VITE_API_URL ||
  "https://playqr-search.adaneeuael07.workers.dev"
).replace(/\/$/, "");
const cache = new Map();
export async function request(
  path,
  { method = "GET", data, privateAccess = false, signal } = {},
) {
  const headers = {};
  if (privateAccess) headers.Authorization = `Bearer ${ownerKey()}`;
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
export async function search(query, signal) {
  const key = query.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < 300000) return hit.value;
  const value = await request("/search?v=3&q=" + encodeURIComponent(query), {
    signal,
  });
  cache.set(key, { value, time: Date.now() });
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

