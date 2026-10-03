import { el, button, heading, empty, guard, toast, copy } from "./ui.js";
import { auth, session, authError, redirectTo } from "./auth.js";
import { syncStatus, flush, initializeWorkspace } from "./sync.js";
import { request } from "./api.js";
import { state, save, ownerKey, guestLibrary } from "./storage.js";
import { collectionCover } from "./collection-design.js";
import { symbol } from "./symbols.js";

function googleMark() {
  const mark = el("span", { class: "google-mark", "aria-hidden": "true" });
  mark.innerHTML = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.32 2.98-7.36Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.41 13.92a6 6 0 0 1 0-3.84V7.49H3.07a10 10 0 0 0 0 9.02l3.34-2.59Z"/><path fill="#EA4335" d="M12 5.96c1.47 0 2.79.51 3.83 1.52l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.49l3.34 2.59A5.99 5.99 0 0 1 12 5.96Z"/></svg>`;
  return mark;
}

function accountIntro() {
  return el(
    "div",
    { class: "account-intro" },
    el("p", { class: "eyebrow" }, "A HOME FOR YOUR GOOD FINDS"),
    el("h1", {}, "Your library.", el("br"), el("em", {}, "Goes with you.")),
    el(
      "p",
      { class: "lede" },
      "Keep the apps you love and the collections you make. Pick up where you left off, on any device.",
    ),
    el(
      "div",
      { class: "library-preview", "aria-hidden": "true" },
      el(
        "div",
        { class: "preview-caption" },
        "THE GOOD STUFF, ALL TOGETHER",
        symbol("arrow"),
      ),
      el("div", { class: "preview-sheet preview-sheet-back" }),
      el(
        "div",
        { class: "preview-sheet preview-sheet-front" },
        el(
          "div",
          { class: "preview-item" },
          symbol("bookmark"),
          el("span", {}, "Saved apps"),
          el("span", { class: "preview-dot" }),
        ),
        el(
          "div",
          { class: "preview-item" },
          symbol("stack"),
          el("span", {}, "Your collections"),
          symbol("arrow"),
        ),
        el(
          "div",
          { class: "preview-item" },
          symbol("link"),
          el("span", {}, "Links worth sharing"),
          symbol("arrow"),
        ),
      ),
      el(
        "div",
        { class: "preview-sync" },
        symbol("devices"),
        "One library. All your devices.",
      ),
    ),
    el(
      "p",
      { class: "account-privacy small-note" },
      symbol("lock"),
      "Your favorites stay private. You choose what to share.",
    ),
  );
}

function guestOption() {
  return el(
    "div",
    { class: "guest-option" },
    el("p", { class: "guest-option-label" }, "Just looking around?"),
    el(
      "a",
      {
        href: "#discover",
        class: "guest-link",
        "aria-describedby": "guest-option-note",
      },
      "Continue as guest",
      el("span", { "aria-hidden": "true" }, "→"),
    ),
    el(
      "p",
      { id: "guest-option-note", class: "small-note" },
      "No sign-in needed. Your saves stay on this device; import them into an account later.",
    ),
  );
}
export async function accountPage(main, isCurrent, refresh) {
  if (!auth) {
    main.append(
      el(
        "div",
        { class: "account-entry" },
        accountIntro(),
        el(
          "section",
          { class: "signin-card" },
          el("h2", {}, "Make yourself at home"),
          el(
            "p",
            { class: "small-note" },
            authError ||
              "Sign-in is being set up. Explore PlayQR as a guest in the meantime.",
          ),
          guestOption(),
        ),
      ),
    );
    return;
  }
  if (!session) {
    const status = el("p", {
      role: "status",
      class: "signin-status small-note",
    });
    const email = el("input", {
      type: "email",
      required: true,
      autocomplete: "email",
      "aria-label": "Email address",
      placeholder: "you@example.com",
    });
    const send = el(
      "button",
      { type: "submit", class: "button primary" },
      "Email me a sign-in link",
    );
    send.append(symbol("arrow"));
    const form = el(
      "form",
      { class: "account-form signin-form" },
      el("label", { class: "signin-email" }, "Email address", email),
      send,
      el(
        "p",
        { class: "signin-note small-note" },
        "No password. Just a secure link to your inbox.",
      ),
      status,
    );
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      send.disabled = true;
      status.textContent = "Sending…";
      try {
        const { error } = await auth.signInWithOtp({
          email: email.value.trim(),
          options: { emailRedirectTo: redirectTo() },
        });
        if (error) throw error;
        status.textContent =
          "Check your inbox and open the sign-in link in this browser. It may take a moment to arrive.";
      } catch (e) {
        status.textContent = e.message;
      } finally {
        send.disabled = false;
      }
    });
    const google = button(
      "Continue with Google",
      guard(async () => {
        const { error } = await auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: redirectTo() },
        });
        if (error) throw error;
      }),
      "button google-button",
    );
    google.prepend(googleMark());
    main.append(
      el(
        "div",
        { class: "account-entry" },
        accountIntro(),
        el(
          "section",
          { class: "signin-card", "aria-labelledby": "signin-title" },
          el("p", { class: "eyebrow" }, "YOUR PLAYQR ACCOUNT"),
          el("h2", { id: "signin-title" }, "Make yourself at home"),
          el(
            "p",
            { class: "signin-description" },
            "Sign in or create an account. Same simple step.",
          ),
          google,
          el(
            "div",
            { class: "signin-divider" },
            el("span", {}, "or continue with email"),
          ),
          form,
          guestOption(),
        ),
      ),
    );
    return;
  }
  main.append(
    heading(
      "YOUR WORKSPACE",
      "Your account",
      "A little home for your library and the things you share.",
    ),
  );
  const workspace = el("div", { class: "account-workspace" });
  main.append(workspace);
  const sync = el("p", { class: "small-note", role: "status" }, syncStatus);
  const listener = () => {
    if (isCurrent()) sync.textContent = syncStatus;
    else window.removeEventListener("playqr:sync", listener);
  };
  window.addEventListener("playqr:sync", listener);
  workspace.append(
    el(
      "section",
      { class: "account-panel account-membership" },
      el("p", { class: "eyebrow" }, symbol("devices"), "CONNECTED ACCOUNT"),
      el("h2", {}, session.user.email || "Your account"),
      sync,
      el(
        "div",
        { class: "detail-actions" },
        button(
          "Sync now",
          guard(async () => {
            await flush();
            sync.textContent = syncStatus;
          }),
        ),
        button(
          "Reload cloud copy",
          guard(async () => {
            if (
              !window.confirm(
                "Replace this device’s account favorites and drafts with the cloud copy? Unsynced account changes will be lost. Your separate guest library is unaffected.",
              )
            )
              return;
            await initializeWorkspace(true);
            refresh();
          }),
        ),
        button(
          "Sign out",
          guard(async () => {
            await flush();
            if (
              syncStatus.startsWith("Sync paused") ||
              syncStatus.startsWith("Sync conflict")
            ) {
              if (
                !window.confirm(
                  "Some changes are only on this device. Sign out anyway? They will remain in this account’s local library.",
                )
              )
                return;
            }
            const { error } = await auth.signOut({ scope: "local" });
            if (error) throw error;
          }),
        ),
      ),
      el("h3", {}, "Bring your browser library with you"),
      el(
        "p",
        { class: "small-note" },
        "Imports saved apps and drafts, and transfers ownership of this browser’s shared links to your account. Links keep working.",
      ),
      button(
        "Import browser library",
        guard(async () => {
          const guest = guestLibrary();
          const favorites = [
            ...new Map(
              [...guest.favorites, ...state.favorites].map((a) => [a.id, a]),
            ).values(),
          ];
          const collections = [
            ...new Map(
              [...guest.collections, ...state.collections].map((c) => [
                c.id,
                c,
              ]),
            ).values(),
          ];
          if (favorites.length > 100 || collections.length > 100)
            throw new Error(
              "Import would exceed the limit of 100 favorites or collections.",
            );
          await request("/account/claim", {
            method: "POST",
            privateAccess: true,
            data: { guestKey: ownerKey() },
          });
          state.favorites = favorites;
          state.collections = collections;
          if (!save())
            throw new Error("Could not save imported drafts on this device.");
          await flush();
          toast(
            "Browser library imported. Shared links now belong to your account.",
          );
          refresh();
        }),
      ),
    ),
  );
  try {
    const { profile } = await request("/account/profile", {
      privateAccess: true,
    });
    if (!isCurrent()) return;
    const handle = el("input", {
      value: profile?.handle || "",
      pattern: "[a-z0-9][a-z0-9-]{2,23}",
      minlength: 3,
      maxlength: 24,
      required: true,
      "aria-label": "Public handle",
      placeholder: "your-name",
    });
    const name = el("input", {
      value: profile?.name || "",
      maxlength: 80,
      required: true,
      "aria-label": "Display name",
    });
    const bio = el(
      "textarea",
      { maxlength: 300, "aria-label": "Profile bio" },
      profile?.bio || "",
    );
    const message = el("p", { role: "status", class: "small-note" });
    const submit = el(
      "button",
      { type: "submit", class: "button primary" },
      "Save public profile",
    );
    const form = el(
      "form",
      { class: "account-panel account-form account-profile" },
      el("p", { class: "eyebrow" }, symbol("link"), "YOUR PUBLIC SPACE"),
      el("h2", {}, "Your public collection page"),
      el(
        "p",
        { class: "small-note" },
        "Your name and bio are public. Only collections you explicitly list appear here. Favorites, drafts and analytics stay private.",
      ),
      el("label", {}, "Handle", handle),
      el("label", {}, "Display name", name),
      el("label", {}, "Bio", bio),
      submit,
      message,
    );
    if (profile)
      form.append(
        el(
          "a",
          { href: "#profile/" + profile.handle, class: "text-link" },
          "View public profile ↗",
        ),
      );
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      submit.disabled = true;
      try {
        await request("/account/profile", {
          method: "POST",
          privateAccess: true,
          data: { handle: handle.value, name: name.value, bio: bio.value },
        });
        toast("Public profile saved");
        refresh();
      } catch (e) {
        message.textContent = e.message;
      } finally {
        submit.disabled = false;
      }
    });
    workspace.append(form);
  } catch (e) {
    if (isCurrent()) main.append(empty("Profile could not load", e.message));
  }
}
export async function profilePage(main, handle, isCurrent) {
  try {
    const { profile, collections } = await request(
      "/profiles/" + encodeURIComponent(handle),
    );
    if (!isCurrent()) return;
    main.append(
      heading("@" + profile.handle, profile.name, profile.bio),
      button(
        "Copy profile link",
        guard(() => copy(location.href)),
      ),
      el(
        "div",
        { class: "collections-grid" },
        collections.map((c) =>
          el(
            "a",
            { href: "#share/" + c.code, class: "collection-card" },
            collectionCover(c.presentation, true),
            el("h2", {}, c.title),
            el(
              "p",
              { class: "muted" },
              c.description || "Explore this collection",
            ),
            el("span", { class: "text-link" }, "Explore collection ↗"),
          ),
        ),
      ),
    );
    if (!collections.length)
      main.append(
        empty(
          "A collection of possibilities",
          "This curator has not listed any collections yet.",
        ),
      );
  } catch (e) {
    if (isCurrent()) main.append(empty("Profile unavailable", e.message));
  }
}

