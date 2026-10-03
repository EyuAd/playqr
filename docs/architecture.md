# Architecture and boundaries

## Existing system

See [the initial audit](audit.md). The app retains vanilla JavaScript, GitHub Pages and Cloudflare Workers. D1 stores links, visit aggregates, optional cloud libraries and public profiles. Apple search complements the Google Play parser; Supabase provides optional identity verification, not application-data storage.

## Data ownership

| Data                                                      | Storage              | Access                                            |
| --------------------------------------------------------- | -------------------- | ------------------------------------------------- |
| Favorites, recent apps/searches, collection drafts, theme | Browser localStorage | This browser                                      |
| Random 256-bit management key                             | Browser localStorage | Bearer credential; never include in a public link |
| Published app/collection snapshot                         | D1 `links`           | Public by unguessable code                        |
| Owner key hash, totals, last visit                        | D1 `links`           | Owner-authenticated API                           |
| Day/device/browser/country counts                         | D1 `scan_daily`      | Owner-authenticated analytics                     |

The composite daily primary key aggregates repeated visits. An owner/creation index supports the bounded 200-link library. A single conditional insert enforces that limit atomically. Parameterized statements handle all user inputs. A batch transaction updates link totals and the daily bucket together.

## API

| Method / route                          | Purpose                                             | Protection                                                    |
| --------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------- |
| GET `/health`                           | API version and database-binding status             | Public; not a DB connectivity probe                           |
| GET `/search?q=`                        | Up to six real app results                          | Query 2–120 characters                                        |
| GET `/app?id=`                          | One normalized app                                  | Android package validation                                    |
| POST `/links`                           | Publish app or collection snapshot                  | Bearer key, 16KB body limit, 200 links/key                    |
| GET `/library`                          | Recent owned shares and totals                      | Bearer key                                                    |
| GET `/links/:code`                      | Public snapshot and current app metadata            | Valid random code; no private counts                          |
| PATCH `/links/:code`                    | Rename a published link (1–80 characters)           | Owner-filtered SQL; destination immutable                     |
| DELETE `/links/:code`                   | Revoke link and cascade-delete aggregates           | Owner-filtered SQL; UI confirmation                           |
| GET `/a/:code`                          | Device-aware 302, eligible visit count              | No arbitrary redirect destination                             |
| GET `/analytics/:code?range=7\|30\|all` | Aggregate scan data                                 | Owner key comparison                                          |
| GET `/auth/config`                      | Public auth project configuration or disabled state | Publishable key only                                          |
| GET/POST `/account/library`             | Read/write cloud favorites and drafts               | Verified account; 128KB limit; revision comparison            |
| GET/POST `/account/profile`             | Manage opt-in public name/handle/bio                | Verified account; unique handle                               |
| POST `/account/claim`                   | Transfer guest links to account                     | Verified account plus possession of guest key; 200-link limit |
| GET `/profiles/:handle`                 | Public curator page                                 | Only explicitly listed collections; no private metrics        |

CORS permits the configured frontend origin (and explicit local development). It is not authentication. The Worker rate-limit binding permits 60 requests/minute per IP at each Cloudflare location; this is a best-effort abuse limit, not a global billing ceiling. See [Cloudflare's rate-limiting behavior](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

## Failure behavior

Missing metadata stays missing. Failed icons display an explicit unavailable label, not fake artwork. A partially successful search returns usable apps; all-detail failures return a retryable error. Invalid inputs return 400; missing ownership 401/403; absent links 404; request limits 413/429; upstream failures 502/504. Database failure does not disable direct app search or direct QR generation. Analytics failure does not prevent a redirect.

All external metadata enters DOM text nodes. Allowed image hosts are restricted. Direct app destinations are constructed from validated package IDs; smart-link destinations cannot be supplied by a visitor. No API secret belongs in `VITE_*` values.

App Store discovery uses fixed Apple Search/Lookup URLs directly from the browser, with credentials omitted and no referrer. Both-store discovery combines that request with the Google Play Worker request, preserves store order, cancels stale requests, and reports partial provider failures. Successful searches/details use a bounded five-minute in-memory cache. Server-side iOS lookups for shared links first try Apple Lookup, then extract SoftwareApplication JSON-LD from the official listing when Lookup fails. The canonical listing must match the requested Apple ID; browser-supplied titles and icons never establish a shared app's identity. Verified server metadata is cached for six hours.

## Honest limitations

- Google Play has no public general-purpose app search API used here. Public HTML/JSON-LD may change, throttle, or differ by country. Results use US/English listings. A metadata provider is the scaling path.
- Apple can throttle or reject shared datacenter IPs. Browser discovery avoids depending on Cloudflare's Apple API access, but still requires Apple to allow browser requests. The official listing fallback protects shared-link lookups, not server-side Apple keyword search; listing formats can change. Provider failures remain visible and retryable.
- Google/email accounts require external Supabase, Google OAuth and SMTP configuration; until then the UI explicitly reports setup pending. Tests with mock identity do not establish live sign-in readiness. Guest keys have no recovery mechanism; there is no automatic retention purge.
- Browser-side offline support covers already loaded/saved data. It is not an installable offline PWA and does not promise cold offline startup.
- Counts are approximate visits, not unique users. Privacy preferences, bots, rate limiting, and failed writes affect totals.
- A key-per-browser quota is not a defense against distributed deliberate abuse. Production growth needs stronger publication controls, monitoring, and budget alerts.
- Published collections contain app-ID snapshots; metadata is refreshed from stores and removed apps may become unavailable. Both providers use US listings.

See [account configuration and release checks](accounts-setup.md). Signed-in libraries are partitioned by account on the client, and every server operation uses a provider-verified identity. Cloud writes use atomic revision checks; stale edits stay local until explicitly resolved. Publishing a public profile does not automatically list existing collections. Revoking a listed collection removes it from that profile.

