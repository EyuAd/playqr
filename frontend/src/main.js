import { qrPanel } from "./qr-panel.js";
import { analytics, privacy } from "./insights.js";
import "./styles.css";
import { symbol } from "./symbols.js";
import { stepArt } from "./step-art.js";
import { appPassport } from "./passport.js";
import { backupPanel } from "./backup.js";
import { manageLink } from "./link-management.js";
import {
  el,
  button,
  icon,
  metadata,
  appCard,
  empty,
  skeleton,
  toast,
  copy,
  guard,
  heading,
  errorPanel,
  prettyNumber,
} from "./ui.js";
import { state, save, remember, favorite } from "./storage.js";
import { search, appDetails, publish, request, API } from "./api.js";
import {
  parseStoreUrl,
  validAppId,
  storeUrl,
  storeLabel,
  isIOS,
} from "../../shared/domain.js";
import { covers, categories, curate } from "../../shared/curation.js";
import { pairPicker } from "./pairing.js";
import { collectionCover } from "./collection-design.js";
import { initAuth, session } from "./auth.js";
import { initializeWorkspace, syncStatus } from "./sync.js";
import { accountPage, profilePage } from "./account.js";
import { reorderApps, duplicateCollection } from "../../shared/collections.js";

const main = document.querySelector("#main");
const discoveryState = { query: "", store: "all" };
let routeVersion = 0,
  ready = false,
  currentRequest,
  debounce;
const known = new Map(
  [...state.recent, ...state.favorites].map((a) => [a.id, a]),
);
function rememberApp(app) {
  known.set(app.id, app);
  if (!remember(app))
    toast("Browser storage is full. This app could not be saved.");
}
function openApp(app) {
  rememberApp(app);
  location.hash = "app/" + app.id;
}
function cards(apps, notes = {}) {
  return el(
    "div",
    { class: "results-grid" },
    apps.map((app) => {
      const card = appCard(
        app,
        openApp,
        (a, e) => {
          const selected = favorite(a);
          e.currentTarget.textContent = selected ? "♥ Saved" : "♡ Save";
          toast(selected ? "Saved to your library" : "Removed from favorites");
        },
        state.favorites.some((a) => a.id === app.id),
        addToCollection,
      );
      if (notes[app.id])
        card.append(
          el(
            "p",
            { class: "curator-note" },
            el("span", {}, "CURATOR’S NOTE"),
            notes[app.id],
          ),
        );
      return card;
    }),
  );
}
function updateCounts() {
  document.querySelector("#collection-count").textContent =
    state.collections.length || "";
}
function addToCollection(app) {
  const dialog = el("dialog", { class: "dialog" }),
    close = button("Close", () => dialog.close(), "text-button");
  const content = el(
    "form",
    { method: "dialog" },
    el(
      "div",
      { class: "section-heading" },
      el("h2", {}, "Add to collection"),
      close,
    ),
  );
  state.collections.forEach((c) =>
    content.append(
      button(
        c.title,
        () => {
          if (!c.apps.some((a) => a.id === app.id)) {
            if (c.apps.length >= 20) {
              toast("Collections can contain up to 20 apps.");
              return;
            }
            c.apps.push(app);
            save();
          }
          dialog.close();
          toast("Added to " + c.title);
        },
        "collection-choice",
      ),
    ),
  );
  const input = el("input", {
    placeholder: "e.g. My Android setup",
    maxlength: 80,
    "aria-label": "New collection title",
  });
  content.append(
    el("label", {}, "Create a new collection", input),
    button(
      "Create & add",
      () => {
        if (!input.value.trim()) {
          input.focus();
          return;
        }
        state.collections.push({
          id: crypto.randomUUID(),
          title: input.value.trim(),
          description: "",
          apps: [app],
        });
        save();
        updateCounts();
        dialog.close();
        toast("Collection created");
      },
      "button primary",
    ),
  );
  dialog.append(content);
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
  input.focus();
}
function discover() {
  const hero = el(
    "section",
    { class: "hero" },
    el(
      "div",
      { class: "hero-copy" },
      el(
        "p",
        { class: "eyebrow" },
        el("span", { class: "edition" }, "P / Q"),
        "GOOD FINDS. ZERO FRICTION.",
      ),
      el("h1", {}, "Find an app.", el("br"), el("em", {}, "Pass it on.")),
      el(
        "p",
        { class: "lede" },
        "Search Google Play or the App Store—even from your iPhone. Turn the exact app into a QR code, ready for the next screen.",
      ),
    ),
  );
  hero.append(appPassport());
  const input = el("input", {
    type: "search",
    placeholder: "App name or store link…",
    maxlength: 2048,
    "aria-label": "App name or store URL",
    autocomplete: "off",
    id: "app-search",
  });
  const submit = el(
    "button",
    { type: "submit", class: "button primary" },
    "Find app ",
    el("span", { "aria-hidden": "true" }, "↗"),
  );
  const form = el(
    "form",
    { class: "search-form" },
    symbol("search", "symbol search-symbol"),
    input,
    submit,
  );
  const status = el(
    "p",
    { class: "search-status", role: "status", "aria-live": "polite" },
    "US store listings · No account needed",
  );
  const store = el(
    "select",
    { "aria-label": "App store", class: "store-filter" },
    el("option", { value: "all" }, "Both stores"),
    el("option", { value: "android" }, "Google Play · Android"),
    el("option", { value: "ios" }, "App Store · iPhone"),
  );
  store.addEventListener("change", () => {
    discoveryState.store = store.value;
    if (input.value.trim().length >= 2) void run();
  });
  const results = el("section", {
    class: "search-results",
    "aria-label": "App search results",
  });
  const suggestions = el(
    "div",
    { class: "suggestions" },
    el("span", {}, "TRY"),
    ["Spotify", "Notion", "WhatsApp", "TakeCare by Marriott"].map((q) =>
      button(
        q,
        () => {
          input.value = q;
          void run();
        },
        "chip",
      ),
    ),
  );
  const recent = el(
    "div",
    { class: "suggestions" },
    state.searches.length ? el("span", {}, "Recent") : null,
    state.searches.slice(0, 5).map((q) =>
      button(
        q,
        () => {
          input.value = q;
          void run();
        },
        "chip",
      ),
    ),
  );
  let sequence = 0;
  async function run() {
    clearTimeout(debounce);
    currentRequest?.abort();
    const ticket = ++sequence,
      route = routeVersion,
      q = input.value.trim();
    discoveryState.query = input.value;
    discoveryState.store = store.value;
    hero.classList.toggle("search-active", q.length >= 2);
    if (q.length < 2) {
      results.replaceChildren();
      results.removeAttribute("aria-busy");
      status.textContent = "Enter at least two characters.";
      return;
    }
    const direct = parseStoreUrl(q);
    if (!direct && (/https?:|play\.google|:\/\//i.test(q) || q.length > 120)) {
      results.replaceChildren();
      results.removeAttribute("aria-busy");
      status.textContent =
        "Paste a direct Google Play or apps.apple.com app listing link.";
      return;
    }
    const controller = new AbortController();
    currentRequest = controller;
    status.textContent = "Finding apps in your selected stores…";
    results.replaceChildren(skeleton());
    results.setAttribute("aria-busy", "true");
    submit.disabled = true;
    try {
      const data = direct
        ? { apps: [(await appDetails(direct.id, controller.signal)).app] }
        : await search(q, controller.signal, store.value);
      if (ticket !== sequence || route !== routeVersion) return;
      data.apps.forEach((a) => known.set(a.id, a));
      results.replaceChildren(
        data.apps.length
          ? cards(data.apps)
          : empty(
              "No matches this time",
              "Try the exact app name or include the developer.",
            ),
      );
      status.textContent = data.apps.length
        ? `${data.apps.length} matches · Choose an app to share`
        : "No matching apps found";
      if (data.warning) status.textContent += " · " + data.warning;
      state.searches = [q, ...state.searches.filter((x) => x !== q)].slice(
        0,
        8,
      );
      save();
    } catch (e) {
      if (
        ticket !== sequence ||
        route !== routeVersion ||
        e.name === "AbortError"
      )
        return;
      status.textContent = navigator.onLine
        ? "Search unavailable"
        : "You’re offline";
      results.replaceChildren(errorPanel(e.message, () => void run()));
    } finally {
      if (ticket === sequence) {
        submit.disabled = false;
        results.removeAttribute("aria-busy");
      }
    }
  }
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    void run();
  });
  input.addEventListener("input", () => {
    discoveryState.query = input.value;
    currentRequest?.abort();
    sequence++;
    clearTimeout(debounce);
    submit.disabled = false;
    results.removeAttribute("aria-busy");
    if (input.value.trim().length < 2) {
      hero.classList.remove("search-active");
      results.replaceChildren();
      status.textContent = "Enter an app name or paste its store link.";
      return;
    }
    debounce = setTimeout(() => void run(), 650);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      const first = results.querySelector(".app-open");
      if (first) {
        e.preventDefault();
        first.focus();
      }
    }
  });
  results.addEventListener("keydown", (e) => {
    if (!["ArrowDown", "ArrowUp"].includes(e.key)) return;
    const buttons = [...results.querySelectorAll(".app-open")],
      i = buttons.indexOf(document.activeElement);
    if (i >= 0) {
      e.preventDefault();
      buttons[
        (i + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length
      ].focus();
    }
  });
  hero
    .querySelector(".hero-copy")
    .append(
      el(
        "section",
        { class: "search-station", "aria-label": "Find an app" },
        el(
          "div",
          { class: "store-toolbar" },
          el("label", {}, "Look in", store),
          el("span", { class: "small-note" }, "Press / to search"),
        ),
        form,
        status,
        suggestions,
        recent,
      ),
    );
  main.append(hero, el("section", { class: "search-area" }, results));
  if (state.recent.length)
    main.append(
      el(
        "div",
        { class: "section-heading" },
        el("h2", {}, "Pick up where you left off"),
        el("a", { href: "#dashboard", class: "text-link" }, "Your library ↗"),
      ),
      cards(state.recent.slice(0, 4)),
    );
  main.append(
    el(
      "section",
      { class: "how", "aria-label": "What you can do with PlayQR" },
      [
        [
          "01",
          "Straight to the app.",
          "Choose the exact listing. Your QR opens that app—not a page of search results.",
        ],
        [
          "02",
          "A collection worth keeping.",
          "Build a new-phone setup, add your notes, and share the whole collection in one go.",
        ],
        [
          "03",
          "Share it. Follow it.",
          "Pair Android and iPhone listings, then see where your smart links go.",
        ],
      ].map(([, t, d], index) =>
        el(
          "div",
          { class: "how-step" },
          stepArt(index),
          el("h3", {}, t),
          el("p", {}, d),
          el(
            "a",
            {
              class: "text-link",
              href: ["#discover", "#collections", "#dashboard"][index],
              ...(index === 0
                ? {
                    onclick: () => {
                      input.focus();
                      input.scrollIntoView({
                        block: "center",
                        behavior: "smooth",
                      });
                    },
                  }
                : {}),
            },
            ["Find an app", "Build a collection", "Open your library"][index],
            symbol("arrow"),
          ),
        ),
      ),
    ),
  );
  if (discoveryState.query.trim().length >= 2) {
    input.value = discoveryState.query;
    store.value = discoveryState.store;
    void run();
  }
}
async function details(id, version) {
  if (!validAppId(id)) {
    main.append(
      empty(
        "That app link isn’t valid",
        "Return to search to find an app.",
        el("a", { href: "#discover", class: "button primary" }, "Find an app"),
      ),
    );
    return;
  }
  main.append(skeleton());
  let app = known.get(id);
  try {
    if (!app || !app.description) app = (await appDetails(id)).app;
    if (version !== routeVersion) return;
    rememberApp(app);
    main.replaceChildren(
      el("a", { href: "#discover", class: "back-link" }, "← Back to discovery"),
    );
    const info = el(
      "section",
      { class: "app-detail" },
      el(
        "p",
        { class: "eyebrow" },
        storeLabel(app.id) + " · AN APP WORTH SHARING",
      ),
      el(
        "div",
        { class: "app-detail-heading" },
        icon(app, true),
        el(
          "div",
          {},
          el("h1", {}, app.title),
          el("p", { class: "muted" }, app.developer),
        ),
      ),
      el(
        "div",
        { class: "detail-meta" },
        metadata(app),
        app.reviews ? ` · ${prettyNumber(app.reviews)} reviews` : "",
      ),
      el(
        "p",
        { class: "description" },
        app.description || "View the store listing for full app information.",
      ),
      el(
        "div",
        { class: "detail-actions" },
        el(
          "a",
          {
            href: storeUrl(app.id),
            target: "_blank",
            rel: "noopener",
            class: "button primary",
          },
          "Open " + storeLabel(app.id) + " ↗",
        ),
        button("♡ Save app", () => {
          toast(
            favorite(app) ? "Saved to your library" : "Removed from favorites",
          );
        }),
        button("+ Collection", () => addToCollection(app)),
      ),
      el(
        "div",
        { class: "handoff-note" },
        el("strong", {}, "The right app. On the right device."),
        el(
          "p",
          {},
          "This listing is for " +
            (isIOS(app.id) ? "iPhone / iPad" : "Android") +
            ". You can pair a confirmed version from the other store below.",
        ),
      ),
    );
    const pairing = pairPicker(app);
    info.append(pairing.element);
    const panel = await qrPanel(
      app.title,
      storeUrl(app.id),
      async () => {
        const result = await publish({
          kind: "app",
          id: app.id,
          ...pairing.selection(),
        });
        pairing.lock();
        return result;
      },
      { apps: [app], kind: "app" },
    );
    if (version !== routeVersion) return;
    main.append(el("div", { class: "detail-layout" }, info, panel));
  } catch (e) {
    if (version === routeVersion)
      main.replaceChildren(errorPanel(e.message, () => void route()));
  }
}
function collections() {
  main.append(
    heading(
      "YOUR APP COLLECTIONS",
      "A setup worth sharing.",
      "Build an app collection for a new phone, a team, or a little inspiration.",
    ),
  );
  main.append(
    button(
      "+ New collection",
      () => {
        const c = {
          id: crypto.randomUUID(),
          title: "Untitled collection",
          description: "",
          apps: [],
        };
        state.collections.push(c);
        save();
        updateCounts();
        location.hash = "collection/" + c.id;
      },
      "button primary",
    ),
  );
  if (!state.collections.length) {
    main.append(
      empty(
        "Your next setup starts here",
        "Create a collection, then add apps from search results.",
      ),
    );
    return;
  }
  main.append(
    el(
      "div",
      { class: "collections-grid" },
      state.collections.map((c) =>
        el(
          "a",
          { href: "#collection/" + c.id, class: "collection-card" },
          collectionCover(c, true),
          el(
            "div",
            { class: "icon-stack" },
            c.apps.slice(0, 4).map((a) => icon(a)),
            !c.apps.length
              ? el("span", { class: "collection-symbol" }, "▦")
              : null,
          ),
          el("h2", {}, c.title),
          el(
            "p",
            { class: "muted" },
            c.description || "Your handpicked apps, in one place.",
          ),
          el(
            "div",
            { class: "section-heading" },
            el("span", {}, `${c.apps.length} apps`),
            el("span", {}, "Open collection ↗"),
          ),
        ),
      ),
    ),
  );
}
function editCollection(id) {
  const c = state.collections.find((x) => x.id === id);
  if (!c) {
    main.append(
      empty(
        "Collection not found",
        "This collection may live in another browser.",
      ),
    );
    return;
  }
  const title = el("input", {
      value: c.title,
      maxlength: 80,
      "aria-label": "Collection title",
      class: "title-input",
    }),
    description = el(
      "textarea",
      {
        maxlength: 500,
        "aria-label": "Collection description",
        placeholder: "What brings these apps together?",
      },
      c.description,
    );
  const list = el("div", { class: "collection-apps" });
  const listed = el("input", { type: "checkbox" });
  const cover = el(
    "select",
    { "aria-label": "Collection cover" },
    covers.map((value) =>
      el(
        "option",
        { value, selected: value === (c.cover || "forest") },
        value[0].toUpperCase() + value.slice(1),
      ),
    ),
  );
  const category = el(
    "select",
    { "aria-label": "Collection category" },
    categories.map((value) =>
      el(
        "option",
        { value, selected: value === (c.category || "Everyday") },
        value,
      ),
    ),
  );
  const coverPreview = el("div", {}, collectionCover(c));
  for (const control of [cover, category])
    control.addEventListener("change", () => {
      c.cover = cover.value;
      c.category = category.value;
      save();
      coverPreview.replaceChildren(collectionCover(c));
    });
  const redraw = () => {
    list.replaceChildren(
      ...c.apps.map((a, index) =>
        el(
          "div",
          { class: "collection-row" },
          icon(a),
          el(
            "div",
            { class: "collection-app-label" },
            el("strong", {}, a.title),
            el("p", { class: "muted" }, a.developer),
            (() => {
              const note = el(
                "textarea",
                {
                  "aria-label": `Why you recommend ${a.title}`,
                  maxlength: 240,
                  rows: 2,
                  class: "app-note",
                  placeholder: "Why do you recommend this app?",
                },
                c.notes?.[a.id] || "",
              );
              note.addEventListener("input", () => {
                c.notes ||= {};
                c.notes[a.id] = note.value;
                save();
              });
              return note;
            })(),
          ),
          el(
            "div",
            { class: "collection-order" },
            ...[-1, 1].map((direction) => {
              const move = button(
                direction === -1 ? "↑" : "↓",
                () => {
                  const previous = c.apps;
                  c.apps = reorderApps(c.apps, index, direction);
                  if (!save()) {
                    c.apps = previous;
                    toast(
                      "Could not save the new order. Browser storage may be full.",
                    );
                    return;
                  }
                  redraw();
                  toast(`${a.title} moved ${direction === -1 ? "up" : "down"}`);
                  const movedRow = list
                    .querySelectorAll(".collection-row")
                    .item(index + direction);
                  movedRow
                    ?.querySelector(".collection-order button:not(:disabled)")
                    ?.focus();
                },
                "icon-button",
              );
              move.setAttribute(
                "aria-label",
                `Move ${a.title} ${direction === -1 ? "up" : "down"}`,
              );
              move.disabled =
                index + direction < 0 || index + direction >= c.apps.length;
              return move;
            }),
          ),
          button(
            "Remove",
            () => {
              c.apps = c.apps.filter((x) => x.id !== a.id);
              save();
              redraw();
            },
            "text-button",
          ),
        ),
      ),
    );
    if (!c.apps.length)
      list.append(
        empty(
          "A collection of possibilities",
          "Find an app and choose “+ Collection” to add it here.",
          el("a", { href: "#discover", class: "button primary" }, "Find apps"),
        ),
      );
  };
  [title, description].forEach((input) =>
    input.addEventListener("input", () => {
      c.title = title.value;
      c.description = description.value;
      save();
    }),
  );
  main.append(
    el("a", { href: "#collections", class: "back-link" }, "← All collections"),
    heading("COLLECTION EDITOR", "Make it your own."),
    el(
      "div",
      { class: "collection-management" },
      button("Duplicate collection", () => {
        if (state.collections.length >= 100) {
          toast("Your browser can hold up to 100 collection drafts.");
          return;
        }
        const duplicate = duplicateCollection(c, crypto.randomUUID());
        state.collections.push(duplicate);
        if (!save()) {
          state.collections.pop();
          toast("Could not save the copy. Browser storage may be full.");
          return;
        }
        updateCounts();
        location.hash = "collection/" + duplicate.id;
        toast("Collection duplicated");
      }),
      button(
        "Delete draft",
        () => {
          const dialog = el("dialog", {
            class: "dialog",
            "aria-labelledby": "delete-draft-title",
          });
          dialog.append(
            el("h2", { id: "delete-draft-title" }, "Delete this draft?"),
            el(
              "p",
              {},
              `“${c.title}” will be removed from this browser. Published links remain available. This cannot be undone.`,
            ),
            el(
              "div",
              { class: "detail-actions" },
              button("Cancel", () => dialog.close()),
              button(
                "Delete draft",
                () => {
                  const previous = state.collections;
                  state.collections = previous.filter(
                    (item) => item.id !== c.id,
                  );
                  if (!save()) {
                    state.collections = previous;
                    toast("Could not delete the draft. Please try again.");
                    return;
                  }
                  dialog.close();
                  updateCounts();
                  location.hash = "collections";
                  toast("Draft deleted. Published links were not changed.");
                },
                "button danger-button",
              ),
            ),
          );
          document.body.append(dialog);
          dialog.addEventListener("close", () => dialog.remove());
          dialog.showModal();
          dialog.querySelector("button").focus();
        },
        "text-button danger-text",
      ),
    ),
    coverPreview,
    el(
      "div",
      { class: "collection-editor" },
      title,
      description,
      el(
        "div",
        { class: "curation-options" },
        el("label", {}, "Cover palette", cover),
        el("label", {}, "Category", category),
      ),
    ),
    list,
    el(
      "div",
      { class: "detail-actions" },
      el(
        "a",
        { href: "#discover", class: "button secondary" },
        "+ Find more apps",
      ),
      button(
        "Publish collection ↗",
        guard(async () => {
          if (!c.title.trim() || !c.apps.length)
            throw new Error("Add a title and at least one app first.");
          const published = await publish({
            kind: "collection",
            title: c.title,
            description: c.description,
            ids: c.apps.map((a) => a.id),
            ...curate(
              c,
              c.apps.map((a) => a.id),
            ),
            listed: session ? listed.checked : false,
          });
          location.hash = "share/" + published.code;
        }),
        "button primary",
      ),
    ),
    ...(session
      ? [
          el(
            "label",
            { class: "confirm-revoke" },
            listed,
            el(
              "span",
              {},
              "List this collection on my public profile (create your profile in Account first).",
            ),
          ),
        ]
      : []),
    el(
      "p",
      { class: "small-note" },
      "Guest drafts stay in this browser; signed-in drafts sync to your account. Publishing creates a public snapshot; later edits won’t change existing links.",
    ),
  );
  redraw();
}
async function shared(code, version) {
  main.append(skeleton());
  try {
    const data = await request("/links/" + encodeURIComponent(code));
    if (version !== routeVersion) return;
    main.replaceChildren(
      ...(data.link.kind === "collection"
        ? [collectionCover(data.link.presentation)]
        : []),
      heading(
        data.link.kind === "collection"
          ? "A SHARED COLLECTION"
          : "PASSING SOMETHING GOOD ALONG",
        data.link.title,
        data.link.description,
      ),
    );
    const panel = await qrPanel(data.link.title, API + "/a/" + code, null, {
      apps: data.apps,
      kind: data.link.kind,
    });
    if (version !== routeVersion) return;
    const content = el(
      "section",
      {},
      data.link.kind === "app"
        ? el(
            "p",
            { class: "handoff-note" },
            "Choose the listing for your device. Store availability may vary by country.",
          )
        : null,
      cards(data.apps, data.link.presentation?.notes),
      data.unavailable
        ? el(
            "p",
            { class: "error-text" },
            `${data.unavailable} app(s) are currently unavailable.`,
          )
        : null,
    );
    if (data.link.kind === "collection")
      content.prepend(
        button(
          "Save a copy to my collections",
          () => {
            if (state.collections.length >= 100) {
              toast("Your library can hold up to 100 collections.");
              return;
            }
            if (!data.apps.length) {
              toast("No available apps can be copied right now.");
              return;
            }
            const c = {
              id: crypto.randomUUID(),
              title: data.link.title,
              description: data.link.description,
              apps: data.apps.map((a) => ({ ...a })),
              ...curate(
                data.link.presentation,
                data.apps.map((a) => a.id),
              ),
            };
            state.collections.push(c);
            if (!save()) {
              state.collections.pop();
              toast("Could not save this collection.");
              return;
            }
            updateCounts();
            location.hash = "collection/" + c.id;
            toast("Your own editable copy is ready.");
          },
          "button primary",
        ),
      );
    main.append(el("div", { class: "detail-layout" }, content, panel));
  } catch (e) {
    if (version === routeVersion)
      main.replaceChildren(errorPanel(e.message, () => void route()));
  }
}
async function dashboard(version) {
  main.append(
    el(
      "div",
      { class: "library-account" },
      el(
        "span",
        { class: "small-note" },
        session ? syncStatus : "Guest library · Saved on this device",
      ),
      el(
        "a",
        { href: "#account", class: "text-link" },
        session ? "Account & sync ↗" : "Use PlayQR across devices ↗",
      ),
    ),
  );
  main.append(
    heading(
      "YOUR LIBRARY",
      "Keep the good finds.",
      session
        ? "Your saved apps, collections, and private link insights."
        : "Your saved apps and private link insights. Stored in this browser.",
    ),
  );
  const saved = el(
    "section",
    {},
    el("div", { class: "section-heading" }, el("h2", {}, "Favorite apps")),
    state.favorites.length
      ? cards(state.favorites)
      : empty(
          "Keep your favorites close",
          "Tap Save on any app to find it here.",
        ),
  );
  if (!session) main.append(backupPanel(() => void route()));
  main.append(saved);
  if (state.recent.length)
    main.append(
      el(
        "section",
        {},
        el(
          "div",
          { class: "section-heading" },
          el("h2", {}, "Recently viewed"),
        ),
        cards(state.recent.slice(0, 8)),
      ),
    );
  const links = el(
    "section",
    {},
    el(
      "div",
      { class: "section-heading" },
      el("h2", {}, "Your shared links"),
      button("Refresh", () => void route(), "text-button"),
    ),
    skeleton(),
  );
  main.append(links);
  try {
    const data = await request("/library", { privateAccess: true });
    if (version !== routeVersion) return;
    links.replaceChildren(
      el(
        "div",
        { class: "section-heading" },
        el("h2", {}, "Your shared links"),
        button("Refresh", () => void route(), "text-button"),
      ),
    );
    const total = data.links.reduce((n, l) => n + l.total, 0);
    links.append(
      el(
        "div",
        { class: "stats" },
        [
          ["Shared links", data.links.length],
          ["Recorded visits", prettyNumber(total)],
          [
            "Published collections",
            data.links.filter((l) => l.kind === "collection").length,
          ],
        ].map(([label, n]) =>
          el(
            "div",
            {},
            el("span", { class: "muted" }, label),
            el("strong", {}, n),
          ),
        ),
      ),
    );
    if (total > 0)
      links.append(
        el("h3", {}, "Most visited"),
        el(
          "div",
          { class: "link-list" },
          [...data.links]
            .filter((l) => l.total > 0)
            .sort((a, b) => b.total - a.total)
            .slice(0, 3)
            .map((l) =>
              el(
                "div",
                { class: "section-heading" },
                el(
                  "a",
                  { href: "#analytics/" + l.code, class: "text-link" },
                  l.title,
                ),
                el("strong", {}, prettyNumber(l.total) + " visits"),
              ),
            ),
        ),
        el("h3", {}, "Recently created"),
      );
    if (!data.links.length)
      links.append(
        empty(
          "Your first share is waiting",
          "Create a smart link from an app page to start tracking visits.",
        ),
      );
    else
      links.append(
        el(
          "div",
          { class: "link-list" },
          data.links.map((l) =>
            el(
              "div",
              { class: "link-row" },
              el(
                "div",
                {},
                el("a", { href: "#share/" + l.code }, l.title),
                el(
                  "p",
                  { class: "muted" },
                  l.kind === "collection" ? "Collection" : "App link",
                  l.last_scanned
                    ? " · Last visited " +
                        new Date(l.last_scanned).toLocaleDateString()
                    : " · No visits yet",
                ),
              ),
              el("strong", {}, prettyNumber(l.total)),
              el(
                "div",
                { class: "link-actions" },
                button(
                  "Copy",
                  guard(() => copy(API + "/a/" + l.code)),
                  "text-button",
                ),
                el(
                  "a",
                  { href: "#analytics/" + l.code, class: "text-link" },
                  "Insights ↗",
                ),
                button(
                  "Manage",
                  () => manageLink(l, () => void route()),
                  "text-button",
                ),
              ),
            ),
          ),
        ),
      );
    links.append(
      el(
        "p",
        { class: "small-note" },
        "Visits include QR scans and link opens, not unique people. Previews and privacy opt-outs are excluded when detected.",
      ),
    );
  } catch (e) {
    links.replaceChildren(errorPanel(e.message, () => void route()));
  }
}
async function route() {
  const version = ++routeVersion;
  currentRequest?.abort();
  clearTimeout(debounce);
  main.replaceChildren();
  const [name = "discover", id = ""] = location.hash.slice(1).split("/");
  main.dataset.page = name || "discover";
  const active =
    {
      app: "discover",
      collection: "collections",
      analytics: "dashboard",
      profile: "account",
    }[name] ||
    name ||
    "discover";
  document.querySelectorAll("nav a").forEach((a) => {
    a.removeAttribute("aria-current");
    if (a.hash === "#" + active) a.setAttribute("aria-current", "page");
  });
  updateCounts();
  window.scrollTo(0, 0);
  if (name === "app") await details(id, version);
  else if (name === "collections") collections();
  else if (name === "collection") editCollection(id);
  else if (name === "share") await shared(id, version);
  else if (name === "dashboard") await dashboard(version);
  else if (name === "analytics")
    await analytics(main, id, () => version === routeVersion);
  else if (name === "privacy") privacy(main);
  else if (name === "account")
    await accountPage(
      main,
      () => version === routeVersion,
      () => void route(),
    );
  else if (name === "profile")
    await profilePage(main, id, () => version === routeVersion);
  else discover();
}
const prefersDark = matchMedia("(prefers-color-scheme: dark)");
function theme() {
  document.documentElement.dataset.theme =
    state.theme === "system"
      ? prefersDark.matches
        ? "dark"
        : "light"
      : state.theme;
  document
    .querySelector("#theme")
    .setAttribute(
      "aria-label",
      `Switch to ${document.documentElement.dataset.theme === "dark" ? "light" : "dark"} mode`,
    );
  document
    .querySelector("#theme")
    .replaceChildren(
      symbol(
        document.documentElement.dataset.theme === "dark" ? "sun" : "moon",
      ),
    );
  document.querySelector('meta[name="theme-color"]').content =
    document.documentElement.dataset.theme === "dark" ? "#17191d" : "#f6f4ee";
}
theme();
prefersDark.addEventListener("change", theme);
document.querySelector("#theme").addEventListener("click", () => {
  state.theme =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  save();
  theme();
});
function connectivity() {
  document.querySelector("#offline").hidden = navigator.onLine;
}
document.querySelector(".skip").addEventListener("click", (event) => {
  event.preventDefault();
  main.focus();
});
window.addEventListener("online", connectivity);
window.addEventListener("offline", connectivity);
window.addEventListener("keydown", (event) => {
  if (
    event.key !== "/" ||
    event.ctrlKey ||
    event.altKey ||
    event.metaKey ||
    event.shiftKey ||
    event.target.closest("input, textarea, select, [contenteditable], dialog")
  )
    return;
  const input = document.querySelector("#app-search");
  if (input) {
    event.preventDefault();
    input.focus();
  }
});
connectivity();
window.addEventListener("hashchange", () => {
  if (ready) void route();
});
window.addEventListener("playqr:auth", async () => {
  ready = false;
  routeVersion++;
  currentRequest?.abort();
  main.replaceChildren(skeleton());
  try {
    await initializeWorkspace();
  } catch (e) {
    toast(e.message);
  }
  known.clear();
  theme();
  ready = true;
  void route();
});
main.append(skeleton());
void initAuth()
  .then(() => initializeWorkspace())
  .catch((e) => toast(e.message))
  .finally(() => {
    known.clear();
    ready = true;
    void route();
  });
