# Architecture and boundaries

## Existing system

See [the initial audit](audit.md). The original stack was a static, inline JavaScript website with a Worker search proxy, no database, and externally generated QR images. The upgrade retains vanilla JavaScript, GitHub Pages, Google Play search, and the Cloudflare Worker; separates responsibilities; adds local QR generation and only two persistent tables.

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

| Method / route                          | Purpose                                  | Protection                                 |
| --------------------------------------- | ---------------------------------------- | ------------------------------------------ |
| GET `/health`                           | API version and database-binding status  | Public; not a DB connectivity probe        |
| GET `/search?q=`                        | Up to six real app results               | Query 2–120 characters                     |
| GET `/app?id=`                          | One normalized app                       | Android package validation                 |
| POST `/links`                           | Publish app or collection snapshot       | Bearer key, 16KB body limit, 200 links/key |
| GET `/library`                          | Recent owned shares and totals           | Bearer key                                 |
| GET `/links/:code`                      | Public snapshot and current app metadata | Valid random code; no private counts       |
| GET `/a/:code`                          | Device-aware 302, eligible visit count   | No arbitrary redirect destination          |
| GET `/analytics/:code?range=7\|30\|all` | Aggregate scan data                      | Owner key comparison                       |

CORS permits the configured frontend origin (and explicit local development). It is not authentication. The Worker rate-limit binding permits 60 requests/minute per IP at each Cloudflare location; this is a best-effort abuse limit, not a global billing ceiling. See [Cloudflare's rate-limiting behavior](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

## Failure behavior

Missing metadata stays missing. Failed icons display an explicit unavailable label, not fake artwork. A partially successful search returns usable apps; all-detail failures return a retryable error. Invalid inputs return 400; missing ownership 401/403; absent links 404; request limits 413/429; upstream failures 502/504. Database failure does not disable direct app search or direct QR generation. Analytics failure does not prevent a redirect.

All external metadata enters DOM text nodes. Allowed image hosts are restricted. Direct app destinations are constructed from validated package IDs; smart-link destinations cannot be supplied by a visitor. No API secret belongs in `VITE_*` values.

## Honest limitations

- Google Play has no public general-purpose app search API used here. Public HTML/JSON-LD may change, throttle, or differ by country. Results use US/English listings. A metadata provider is the scaling path.
- No accounts, synchronization, lost-key recovery, link deletion UI, or automatic retention purge yet. Do not publish confidential collection descriptions.
- Browser-side offline support covers already loaded/saved data. It is not an installable offline PWA and does not promise cold offline startup.
- Counts are approximate visits, not unique users. Privacy preferences, bots, rate limiting, and failed writes affect totals.
- A key-per-browser quota is not a defense against distributed deliberate abuse. Production growth needs stronger publication controls, monitoring, and budget alerts.
- Published collections contain package snapshots; metadata is refreshed from Google and removed apps may become unavailable.

