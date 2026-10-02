import { API } from "./config.js";
export let auth = null;
export let session = null;
export let authError = "";
export async function initAuth() {
  try {
    const response = await fetch(API + "/auth/config", {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok)
      throw new Error(
        "Account service is temporarily unavailable. Your browser library still works.",
      );
    const config = await response.json();
    if (!config.enabled) return;
    const { createClient } = await import("@supabase/supabase-js");
    auth = createClient(config.url, config.publishableKey, {
      auth: {
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }).auth;
    const result = await auth.getSession();
    if (result.error) throw result.error;
    session = result.data.session;
    if (new URL(location.href).searchParams.has("code")) {
      const clean = new URL(location.href);
      clean.searchParams.delete("code");
      clean.hash = "account";
      history.replaceState(null, "", clean);
    }
    auth.onAuthStateChange((event, next) => {
      const changed = session?.user.id !== next?.user.id;
      session = next;
      if (changed)
        setTimeout(() => window.dispatchEvent(new Event("playqr:auth")), 0);
    });
  } catch (e) {
    authError = e.message;
  }
}
export async function accessToken() {
  if (!auth) return null;
  const { data, error } = await auth.getSession();
  if (error) throw error;
  return data.session?.access_token || null;
}
export const redirectTo = () => location.origin + location.pathname;
