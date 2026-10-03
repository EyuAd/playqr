import {
  appleSearchUrl,
  appleLookupUrl,
  appleResults,
} from "../../shared/apple.js";

async function readApple(url, signal) {
  const response = await fetch(url, {
    credentials: "omit",
    referrerPolicy: "no-referrer",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(12000)])
      : AbortSignal.timeout(12000),
  });
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? "App Store is receiving too many requests. Please try again in a minute."
        : "App Store is temporarily unavailable. Please retry.",
    );
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("App Store returned unreadable results. Please retry.");
  }
  return appleResults(data);
}

export async function searchAppleBrowser(query, signal) {
  return { apps: (await readApple(appleSearchUrl(query), signal)).slice(0, 6) };
}

export async function appleDetailsBrowser(id, signal) {
  const app = (await readApple(appleLookupUrl(id), signal)).find(
    (a) => a.id === id,
  );
  if (!app) {
    throw Object.assign(
      new Error("This app is not available in the US App Store."),
      { status: 404 },
    );
  }
  return { app };
}

