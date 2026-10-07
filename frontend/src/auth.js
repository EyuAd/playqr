import { API } from "./config.js";
export let auth = null;
export let session = null;
export let authError = "";
export async function initAuth() {
  const callback = new URL(location.href);
  const callbackCode = callback.searchParams.get("error_code");
  const callbackFailed = callback.searchParams.has("error") || callbackCode;
  const callbackMessage =
    callbackCode === "otp_expired"
      ? "That sign-in link has expired or was already used. Request a fresh link below and open it in this browser."
      : callbackFailed
        ? "Sign-in was not completed. Please try again, or continue as a guest."
        : "";
  if (callbackFailed) {
    for (const parameter of ["error", "error_code", "error_description"])
      callback.searchParams.delete(parameter);
    callback.hash = "account";
    history.replaceState(null, "", callback);
    authError = callbackMessage;
  }
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
    if (!session && callbackMessage) authError = callbackMessage;
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
    authError =
      e.name === "TimeoutError" || e.name === "TypeError"
        ? "Account service is temporarily unavailable. Your browser library still works; try again later."
        : e.message;
  }
}
export async function accessToken() {
  if (!auth) return null;
  const { data, error } = await auth.getSession();
  if (error) throw error;
  return data.session?.access_token || null;
}
export const redirectTo = () => location.origin + location.pathname;
