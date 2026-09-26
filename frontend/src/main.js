import { qrPanel } from "./qr-panel.js";
import { analytics, privacy } from "./insights.js";
import "./styles.css";
import { stepArt } from "./step-art.js";
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
import { parsePlayUrl, validId, playUrl } from "../../shared/domain.js";
import { reorderApps, duplicateCollection } from "../../shared/collections.js";

const main = document.querySelector("#main");
let routeVersion = 0,
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
function cards(apps) {
  return el(
    "div",
    { class: "results-grid" },
    apps.map((app) =>
      appCard(
        app,
        openApp,
        (a, e) => {
          const selected = favorite(a);
          e.currentTarget.textContent = selected ? "♥ Saved" : "♡ Save";
          toast(selected ? "Saved to your library" : "Removed from favorites");
        },
        state.favorites.some((a) => a.id === app.id),
        addToCollection,
      ),
    ),
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
        el("span", { class: "live-dot" }),
        "FOR EVERY APP. EVERY DEVICE.",
      ),
      el(
        "h1",
        {},
        "Good apps",
        el("br"),
        "travel.",
        el("span", { class: "hero-arrow", "aria-hidden": "true" }, "↗"),
      ),
      el(
        "p",
        { class: "lede" },
        "Find any Android app and share it instantly.",
        el("br"),
        "One search. One scan. You’re there.",
      ),
    ),
  );
  const art = el(
    "div",
    { class: "hero-art", "aria-hidden": "true" },
    el("div", { class: "orbit orbit-one" }),
    el("div", { class: "orbit orbit-two" }),
    el(
      "div",
      { class: "art-note" },
      "A little square.",
      el("br"),
      "A world of apps.",
    ),
    el(
      "div",
      { class: "art-qr" },
      Array.from({ length: 81 }, (_, i) =>
        el("i", { class: (i * 13 + i * i) % 7 < 4 ? "ink" : "" }),
      ),
    ),
    el("span", { class: "art-caption" }, "FIND IT. SCAN IT. PASS IT ON."),
  );
  hero.append(art);
  const input = el("input", {
    type: "search",
    placeholder: "Search an app or paste a Google Play link",
    maxlength: 2048,
    "aria-label": "App name or Google Play URL",
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
    el("span", { class: "search-symbol", "aria-hidden": "true" }, "⌕"),
    input,
    submit,
  );
  const status = el(
    "p",
    { class: "search-status", role: "status", "aria-live": "polite" },
    "Search Google Play from your iPhone, laptop, or any device.",
  );
  const results = el("section", {
    class: "search-results",
    "aria-label": "App search results",
  });
  const suggestions = el(
    "div",
    { class: "suggestions" },
    el("span", {}, "Try an app"),
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
    if (q.length < 2) {
      results.replaceChildren();
      status.textContent = "Enter at least two characters.";
      return;
    }
    const direct = parsePlayUrl(q);
    if (!direct && (/https?:|play\.google|:\/\//i.test(q) || q.length > 120)) {
      status.textContent =
        "Paste a valid https://play.google.com/store/apps/details?id=… link.";
      return;
    }
    const controller = new AbortController();
    currentRequest = controller;
    status.textContent = "Finding apps on Google Play…";
    results.replaceChildren(skeleton());
    results.setAttribute("aria-busy", "true");
    submit.disabled = true;
    try {
      const data = direct
        ? { apps: [(await appDetails(direct.id, controller.signal)).app] }
        : await search(q, controller.signal);
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
    currentRequest?.abort();
    sequence++;
    clearTimeout(debounce);
    submit.disabled = false;
    if (input.value.trim().length < 2) {
      results.replaceChildren();
      status.textContent = "Enter an app name or paste its Google Play link.";
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
  main.append(
    hero,
    el(
      "section",
      { class: "search-area" },
      form,
      status,
      suggestions,
      recent,
      results,
    ),
  );
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
      { class: "how" },
      [
        [
          "01",
          "Find your next favorite",
          "Real Google Play apps, with the details that matter.",
        ],
        [
          "02",
          "Make the connection",
          "Create a QR code or a link that knows where to go.",
        ],
        [
          "03",
          "Share something good",
          "One app or a whole collection. Ready for any screen.",
        ],
      ].map(([n, t, d], index) =>
        el(
          "div",
          { class: "how-step" },
          stepArt(index),
          el("span", { class: "step-number" }, n),
          el("h3", {}, t),
          el("p", {}, d),
        ),
      ),
    ),
  );
}
async function details(id, version) {
  if (!validId(id)) {
    main.append(
      empty(
        "That app link isn’t valid",
        "Return to search to find an Android app.",
        el("a", { href: "#discover", class: "button primary" }, "Find an app"),
      ),
    );
    return;
  }
  main.append(skeleton());
  let app = known.get(id);
  try {
    if (!app) app = (await appDetails(id)).app;
    if (version !== routeVersion) return;
    rememberApp(app);
    main.replaceChildren(
      el("a", { href: "#discover", class: "back-link" }, "← Back to discovery"),
    );
    const info = el(
      "section",
      { class: "app-detail" },
      el("p", { class: "eyebrow" }, "AN ANDROID APP WORTH SHARING"),
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
        app.description ||
          "View the Google Play listing for full app information.",
      ),
      el(
        "div",
        { class: "detail-actions" },
        el(
          "a",
          {
            href: playUrl(app.id),
            target: "_blank",
            rel: "noopener",
            class: "button primary",
          },
          "Open Google Play ↗",
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
        el("strong", {}, "An Android app. A link for everyone."),
        el(
          "p",
          {},
          "On an iPhone or computer? Share the QR with an Android device to install from Google Play.",
        ),
      ),
    );
    const panel = await qrPanel(
      app.title,
      playUrl(app.id),
      () => publish({ kind: "app", id: app.id }),
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
      "YOUR CURATED CORNER",
      "Better together.",
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
    el("div", { class: "collection-editor" }, title, description),
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
          });
          location.hash = "share/" + published.code;
        }),
        "button primary",
      ),
    ),
    el(
      "p",
      { class: "small-note" },
      "Drafts stay in this browser. Publishing creates a public snapshot; later edits won’t change existing links.",
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
            "This is an Android app. Open Google Play on your Android device to install it.",
          )
        : null,
      cards(data.apps),
      data.unavailable
        ? el(
            "p",
            { class: "error-text" },
            `${data.unavailable} app(s) are currently unavailable.`,
          )
        : null,
    );
    main.append(el("div", { class: "detail-layout" }, content, panel));
  } catch (e) {
    if (version === routeVersion)
      main.replaceChildren(errorPanel(e.message, () => void route()));
  }
}
async function dashboard(version) {
  main.append(
    heading(
      "YOUR LIBRARY",
      "The good stuff, saved.",
      "Your favorites, recent apps, and shared links. Personal to this browser.",
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
                  l.kind === "collection" ? "Collection" : "Android app",
                  l.last_scanned
                    ? " · Last visited " +
                        new Date(l.last_scanned).toLocaleDateString()
                    : " · No visits yet",
                ),
              ),
              el("strong", {}, prettyNumber(l.total)),
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
  document.querySelectorAll("nav a").forEach((a) => {
    a.removeAttribute("aria-current");
    if (a.hash === "#" + name) a.setAttribute("aria-current", "page");
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
connectivity();
window.addEventListener("hashchange", () => void route());
void route();

