# September 2026 audit and implementation plan

The original repository has one static HTML page (inline CSS and JavaScript), a Cloudflare module Worker, and no dependencies, database, authentication, tests, or build process. GitHub Pages serves the frontend; the Worker scrapes Google Play search anchors, then requests each detail page for its official Open Graph image. QR generation sends the destination to api.qrserver.com.

Working features to preserve: app-name search, real Play Store icons, exact listing selection, direct-link input, QR creation, creator credit, and iPhone access.

Issues: developer/rating text is collapsed into the title; metadata is incomplete; URL parsing permits HTTP and detail-path suffixes and omits package validation; stale searches can overwrite new results; request failures lack timeouts; no detail cache; cross-origin downloads may open instead of saving; every QR payload is sent to a third party. Mobile grid intrinsic sizing caused overflow. No saved library or observable sharing workflow exists.

Plan: keep vanilla JavaScript and Cloudflare. Introduce a small Vite build, shared validators, API/storage/QR modules, and tests. Preserve the search integration while extracting structured metadata from detail pages and caching it. Generate PNG/SVG QR codes locally. Add device-aware short links, collections, and aggregate daily analytics in an additive D1 migration. Use anonymous browser-held management keys rather than requiring accounts. Refine responsive layouts, accessible states, theme support, and documentation. Validate each layer before deployment.

No existing data tables require modification. Public links are immutable snapshots; editing a collection locally creates a new published snapshot. Favorites, drafts, and management keys remain on the creating browser. No fake scan counts are used.

