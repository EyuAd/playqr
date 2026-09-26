# PlayQR — Good apps travel.

Find Android apps from any device. Share a direct Google Play QR code, a device-aware link, or an entire collection.

[Live demo](https://eyuad.github.io/playqr/) · [Author](https://github.com/EyuAd) · [Architecture](docs/architecture.md)

![PlayQR desktop search experience](docs/desktop.png)

## What it does

Search by app name or paste a Google Play listing. Choose the correct app using its original icon, developer, category, rating, and price when available. Export a QR locally, save a favorite, or publish a shareable collection.

### Core features

- Debounced, cached Google Play search with original app artwork, keyboard navigation, and explicit empty/error states.
- App-detail pages with direct Play links and locally generated PNG/SVG QR downloads.
- High-contrast QR palettes, light backgrounds, three export sizes, and reset controls.
- Smart links: Android opens Google Play; iPhone and desktop open an informative PlayQR page.
- Collections: local drafts, up to 20 apps, and immutable public snapshots with their own QR.
- A browser-owned library: favorites, recent apps/searches, shared links, most-visited links, and last-visited times.
- Real 7-day, 30-day, and all-time aggregate analytics; no fabricated metrics.
- Responsive light/dark themes, visible keyboard focus, reduced-motion support, and offline messaging.

## Architecture and stack

The original vanilla-JavaScript frontend and Cloudflare Worker remain the foundation. Vite now builds modular JavaScript/CSS, `qrcode` generates images on-device, and Cloudflare D1 stores published links and daily aggregates. No frontend framework, ORM, analytics SDK, or account system is required.

```text
Browser → Worker /search or /app → Google Play public listings
Browser → local QR generation → PNG / SVG
Browser → Worker /links → D1 published snapshot
Scan → Worker /a/:code → Google Play (Android app)
                       → PlayQR share page (other devices / collections)
                       → D1 daily aggregate (eligible visits only)
```

```text
frontend/          HTML, styles, UI, library, QR and API modules
shared/            URL validation, redirects, collection and QR rules
worker/            API routes, Play metadata parser, deployment configuration
worker/migrations/ Additive D1 schema migrations
tests/             Unit/API tests, real local D1 integration, browser smoke test
docs/              Audit, architecture, screenshots, deployment notes
dist/              Generated production build
index.html assets/ Published GitHub Pages build snapshot
```

## Engineering decisions

**A selected app, never search results.** Every QR resolves to an exact validated Android package. Only canonical HTTPS Google Play URLs are accepted. App metadata is rendered as text, never injected as HTML.

**Structured metadata first.** The Worker reads Google's JSON-LD rather than mixing arbitrary page text into app names or developer labels. Open Graph data is a limited fallback. Missing fields stay absent instead of being invented. Only Google's known image hosts are accepted.

**Small, bounded requests.** Search returns up to six matches, with parallel detail requests, timeouts, five-minute search caching, and six-hour app caching at the edge. The browser also maintains a small short-lived cache and cancels stale searches. QR code generation is lazy-loaded.

**Reliable QR customization.** Three dark inks, two light backgrounds, a four-module quiet zone, and high error correction. No center logos or cosmetic module shapes that might compromise scanning. Tests decode every palette to the exact destination.

**No premature authentication system.** A cryptographically random browser key owns published links; only its SHA-256 hash is stored in D1. It is a bearer credential, not an account. Clearing browser data loses access to analytics. Public links remain public. Synchronization and key recovery are future work.

## Smart links

`https://playqr-search.adaneeuael07.workers.dev/a/{code}` is a stable, randomly generated link. Android single-app links redirect to the exact Play listing. Other devices receive a PlayQR information page with sharing options. Collections always open their collection page. Device detection is deliberately simple user-agent classification, not fingerprinting.

Collection publication creates a snapshot. Editing a local draft does not silently change existing shared links. Direct Play QR codes continue to work without a database or smart-link service.

## Analytics and privacy

Counts represent **link opens**, not unique people or provable camera scans. Repeated opens count again. Known bots, previews, prefetch requests, HEAD requests, Do Not Track, and Global Privacy Control are excluded where detectable.

The app stores daily totals by link, device category, browser family, and approximate country. It does not store raw IP addresses, full user agents, referrers, precise locations, cookies, or visitor identifiers. Cloudflare uses IPs transiently for rate limiting. Hosting providers may maintain operational logs under their policies. Icons and fonts are fetched from Google; QR images are generated locally.

The dashboard is protected by the browser key. Public share responses do not expose private totals. Aggregates currently persist for the lifetime of a link. This is not anonymous account recovery or a GDPR compliance certification. See [architecture and operational limitations](docs/architecture.md).

## Local development

Use Node.js 22.12+ and npm. Chrome is needed only for the optional browser smoke test.

```sh
npm ci
npx wrangler d1 migrations apply playqr-sharing --local --config worker/wrangler.local.jsonc
npm run worker:dev
```

In a second terminal, copy `.env.example` to `.env.local`, set `VITE_API_URL=http://127.0.0.1:8787`, and run:

```sh
npm run dev
```

Open `http://127.0.0.1:5173`. Local D1 data lives under `worker/.wrangler/`, not in production. Internet access is required for real Google Play searches. Do not commit `.env.local`, credentials, browser management keys, or local database files.

```sh
npm test                 # URL/redirect/metadata/QR/API validation tests
npm run lint
npm run build
npm run worker:build     # Worker bundle validation, no deployment
node tests/integration.mjs # local Worker and migrated D1 must be running
node tests/browser.mjs     # local frontend + Worker + Chrome; real upstream requests
```

The browser check covers real search/icons, QR sizing/export, smart links, collection publishing, mobile overflow, and dark mode. Integration checks verify owner isolation and privacy opt-outs against real local D1. Upstream Google Play timeouts can fail browser tests; they are not hidden behind synthetic production data.

## Deployment

See [deployment guide](docs/deployment.md) for database setup, verification, publishing to the existing GitHub Pages branch, and rollback. Deploy the Worker before the frontend. The production database ID in the configuration is an identifier, not a secret; use your own database/account when forking.

## Roadmap

- Account-backed optional sync and management-key recovery.
- Owner-controlled link deletion and configurable aggregate retention.
- Licensed/contracted app-metadata provider if usage outgrows public-page extraction.
- Automated accessibility audits, wider browser coverage, and service-level monitoring.
- Signed release previews and automated deployment once repository deployment permissions are configured.

## Author

Built by [Euael Adane](https://github.com/EyuAd). PlayQR is independent of Google and is not affiliated with Google Play or the apps it lists.

