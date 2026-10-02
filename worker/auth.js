import { createClient } from "@supabase/supabase-js";

export function authConfig(env) {
  const url = env.SUPABASE_URL || "",
    key = env.SUPABASE_PUBLISHABLE_KEY || "";
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) &&
    /^sb_publishable_[A-Za-z0-9_-]+$/.test(key)
    ? { enabled: true, url, publishableKey: key }
    : { enabled: false };
}
export async function digest(value) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export async function accountOwner(request, env) {
  const config = authConfig(env),
    token = request.headers.get("Authorization")?.replace(/^Bearer /, "");
  if (!config.enabled)
    throw Object.assign(new Error("Account sign-in is not configured yet."), {
      status: 503,
    });
  if (!token || token.length > 8192 || !token.includes("."))
    throw Object.assign(new Error("Sign in to continue."), { status: 401 });
  const client = createClient(config.url, config.publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (url, options) =>
        fetch(url, { ...options, signal: AbortSignal.timeout(10000) }),
    },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error?.status >= 500)
    throw Object.assign(
      new Error("The sign-in provider is temporarily unavailable."),
      { status: 502 },
    );
  if (error || !data.user?.id || !data.user.email_confirmed_at)
    throw Object.assign(
      new Error(
        "Your session expired or your email is unconfirmed. Please sign in again.",
      ),
      { status: 401 },
    );
  return digest("account:" + config.url + ":" + data.user.id);
}
export async function resolveOwner(request, env) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer /, "");
  if (/^[a-f0-9]{64}$/.test(token || "")) return digest(token);
  if (token?.includes(".")) return accountOwner(request, env);
  throw Object.assign(
    new Error("Your library key is missing. Reload or sign in again."),
    { status: 401 },
  );
}
