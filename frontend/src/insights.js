import {
  el,
  heading,
  empty,
  skeleton,
  errorPanel,
  prettyNumber,
  button,
} from "./ui.js";
import { analyticsCSV } from "../../shared/csv.js";
import { manageLink } from "./link-management.js";
import { request } from "./api.js";
export async function analytics(main, code, isCurrent) {
  main.append(
    heading(
      "SHARING INSIGHTS",
      "See where it goes.",
      "Anonymous link visits. No cookies or visitor profiles.",
    ),
  );
  const range = el(
    "select",
    { "aria-label": "Analytics time range" },
    el("option", { value: "7" }, "Last 7 days"),
    el("option", { value: "30" }, "Last 30 days"),
    el("option", { value: "all" }, "All time"),
  );
  const content = el("section");
  let exported = null;
  const download = button("↓ Export CSV", () => {
    if (!exported) return;
    const url = URL.createObjectURL(
      new Blob([analyticsCSV(exported.link, exported.rows, exported.range)], {
        type: "text/csv;charset=utf-8",
      }),
    );
    el("a", {
      href: url,
      download: `playqr-${code}-${exported.range === "all" ? "all-time" : exported.range + "-days"}.csv`,
    }).click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  });
  download.disabled = true;
  main.append(
    el("div", { class: "analytics-toolbar" }, range, download),
    content,
  );
  let ticket = 0;
  async function load() {
    const seq = ++ticket;
    exported = null;
    download.disabled = true;
    content.replaceChildren(skeleton());
    try {
      const data = await request(
        "/analytics/" + encodeURIComponent(code) + "?range=" + range.value,
        { privateAccess: true },
      );
      if (!isCurrent() || seq !== ticket) return;
      exported = data;
      download.disabled = false;
      const rows = data.rows,
        total = rows.reduce((n, r) => n + r.count, 0);
      content.replaceChildren(
        el(
          "div",
          { class: "section-heading" },
          el("h2", {}, data.link.title),
          el(
            "a",
            { href: "#share/" + code, class: "text-link" },
            "Open share page ↗",
          ),
        ),
        el(
          "div",
          { class: "stats" },
          el(
            "div",
            {},
            el("span", { class: "muted" }, "Visits in this period"),
            el("strong", {}, prettyNumber(total)),
          ),
        ),
      );
      content.append(
        button(
          "Manage link",
          () =>
            manageLink(data.link, () => {
              location.hash = "dashboard";
            }),
          "text-button",
        ),
      );
      if (!total) {
        content.append(
          empty(
            "A fresh start",
            "Visits will appear after someone opens your smart link.",
          ),
        );
        return;
      }
      const days = new Map();
      if (range.value !== "all")
        for (let i = Number(range.value) - 1; i >= 0; i--)
          days.set(
            new Date(Date.now() - i * 86400000).toISOString().slice(0, 10),
            0,
          );
      rows.forEach((r) => days.set(r.day, (days.get(r.day) || 0) + r.count));
      const max = Math.max(...days.values());
      content.append(
        el("h3", {}, "Visits over time"),
        el(
          "div",
          {
            class: "chart",
            role: "img",
            "aria-label": "Daily visits; exact values in the table below",
          },
          [...days].map(([day, count]) =>
            el(
              "div",
              { class: "chart-column", title: `${day}: ${count}` },
              el("i", { style: `height:${Math.max(3, (count / max) * 100)}%` }),
              el("span", {}, day.slice(5)),
            ),
          ),
        ),
      );
      const table = el(
        "table",
        {},
        el("caption", {}, "Daily visits"),
        el(
          "thead",
          {},
          el(
            "tr",
            {},
            el("th", { scope: "col" }, "Date"),
            el("th", { scope: "col" }, "Visits"),
          ),
        ),
        el(
          "tbody",
          {},
          [...days].map(([day, n]) =>
            el("tr", {}, el("td", {}, day), el("td", {}, n)),
          ),
        ),
      );
      content.append(
        el("details", {}, el("summary", {}, "View daily totals"), table),
      );
      content.append(
        el(
          "div",
          { class: "breakdowns" },
          ["device", "browser", "country"].map((field) => {
            const sums = {};
            rows.forEach(
              (r) => (sums[r[field]] = (sums[r[field]] || 0) + r.count),
            );
            return el(
              "section",
              {},
              el("h3", {}, field[0].toUpperCase() + field.slice(1)),
              Object.entries(sums)
                .sort((a, b) => b[1] - a[1])
                .map(([name, n]) =>
                  el(
                    "div",
                    { class: "section-heading" },
                    el("span", {}, name),
                    el("strong", {}, n),
                  ),
                ),
            );
          }),
        ),
      );
    } catch (e) {
      if (isCurrent() && seq === ticket)
        content.replaceChildren(errorPanel(e.message, () => void load()));
    }
  }
  range.addEventListener("change", () => void load());
  await load();
}
export function privacy(main) {
  main.append(
    heading("PRIVACY BY DESIGN", "Share apps. Keep your privacy."),
    el(
      "article",
      { class: "prose" },
      el("h2", {}, "What stays on your device"),
      el(
        "p",
        {},
        "Guest favorites, recent searches, viewed apps, collection drafts, theme settings, and a random management key are stored in your browser. Clearing site data removes access to a guest library. Signed-in users have a separate local library; favorites and collection drafts synchronize to their account. Recent searches, viewed apps and theme settings are not synchronized.",
      ),
      el("h2", {}, "What sharing stores"),
      el(
        "p",
        {},
        "Published links contain app IDs, a title, optional collection descriptions and notes, a cover palette, a category, and a creation time. Anyone with the link can view them. Collections appear on a public profile only when explicitly listed. Your profile name and bio are public; favorites, drafts and analytics are private. Ownership is checked using your browser key or verified account session. Revoking a link also deletes its visit aggregates.",
      ),
      el("h2", {}, "What a visit records"),
      el(
        "p",
        {},
        "We increment daily totals for the link, device category, browser family, and approximate country provided by Cloudflare. We do not store raw IPs, full user agents, precise location, referrers, or unique visitor IDs. IP addresses are used transiently by Cloudflare for rate limiting. Do Not Track and Global Privacy Control suppress analytics; known bots and prefetches are excluded.",
      ),
      el(
        "p",
        {},
        "Totals count link opens, including repeat visits. A scan cannot be distinguished from a clicked link. Daily aggregates are retained while a shared link exists.",
      ),
      el("h2", {}, "Third parties"),
      el(
        "p",
        {},
        "Google Play and Apple supply public app metadata and icons. Your browser downloads icons from their servers and fonts from Google. Supabase handles Google/email authentication when enabled; your email and sign-in session are processed by that service. PlayQR never handles your Google password. Account libraries are stored on Cloudflare. QR codes are generated locally. GitHub Pages, Cloudflare and authentication providers may process infrastructure logs under their own policies.",
      ),
    ),
  );
}
