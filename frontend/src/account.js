import { el, button, heading, empty, guard, toast, copy } from "./ui.js";
import { auth, session, authError, redirectTo } from "./auth.js";
import { syncStatus, flush, initializeWorkspace } from "./sync.js";
import { request } from "./api.js";
import { state, save, ownerKey, guestLibrary } from "./storage.js";
import { collectionCover } from "./collection-design.js";
function guestOption() {
  return el(
    "div",
    { class: "guest-option" },
    el("p", { class: "guest-option-label" }, "No account? No problem."),
    el(
      "a",
      {
        href: "#discover",
        class: "button secondary",
        "aria-describedby": "guest-option-note",
      },
      "Continue as guest",
    ),
    el(
      "p",
      { id: "guest-option-note", class: "small-note" },
      "Search, save apps and build collections without signing in. Favorites and drafts stay in this browser, not across devices. Sign in later to import them into your account.",
    ),
  );
}
export async function accountPage(main, isCurrent, refresh) {
  main.append(
    heading(
      "YOUR PLAYQR ACCOUNT",
      "Good apps. Everywhere.",
      "Your favorites, collection drafts and shared links, across devices.",
    ),
  );
  if (!auth) {
    main.append(
      el(
        "section",
        { class: "account-panel" },
        el("h2", {}, "Sign-in setup is in progress"),
        el(
          "p",
          { class: "small-note" },
          authError ||
            "Google and email sign-in will be available soon. You can use PlayQR as a guest right now.",
        ),
        guestOption(),
      ),
    );
    return;
  }
  if (!session) {
    const status = el("p", { role: "status", class: "small-note" });
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
    const form = el(
      "form",
      { class: "account-form" },
      el("label", {}, "Email address", email),
      send,
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
    main.append(
      el(
        "section",
        { class: "account-panel" },
        button(
          "Continue with Google",
          guard(async () => {
            const { error } = await auth.signInWithOAuth({
              provider: "google",
              options: { redirectTo: redirectTo() },
            });
            if (error) throw error;
          }),
          "button primary",
        ),
        el(
          "p",
          { class: "small-note" },
          "Or use a secure email link. No password to remember.",
        ),
        form,
        guestOption(),
      ),
    );
    return;
  }
  const sync = el("p", { class: "small-note", role: "status" }, syncStatus);
  const listener = () => {
    if (isCurrent()) sync.textContent = syncStatus;
    else window.removeEventListener("playqr:sync", listener);
  };
  window.addEventListener("playqr:sync", listener);
  main.append(
    el(
      "section",
      { class: "account-panel" },
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
      { class: "account-panel account-form" },
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
    main.append(form);
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
