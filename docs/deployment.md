# Deployment

## Cloudflare Worker and D1

```sh
npx wrangler login
```

For a new account/fork, run `npx wrangler d1 create playqr-sharing`, then update `worker/wrangler.jsonc` with the returned database ID, your account ID, and your frontend URL. The checked-in production config belongs to this deployment. Keep the binding named `DB`. Never replace the production ID with the local test ID.

```sh
npm test
npm run lint
npm run worker:build
npx wrangler d1 migrations apply playqr-sharing --remote --config worker/wrangler.jsonc
npm run worker:deploy
```

The migration is additive and versioned. Do not drop or recreate a live database to deploy. Wrangler tracks applied migrations; see [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/).

Check `/health`, then a known `/app?id=com.spotify.music` and `/search?q=Spotify`. Check an owner-created smart link with Android and iPhone user agents; use `DNT: 1` for operational checks so they do not inflate counts. Integration tests deliberately target localhost only.

## GitHub Pages

This repository keeps the existing branch-root GitHub Pages setup. Source lives in `frontend/`; the root `index.html` and `assets/` are generated release files, not files to hand-edit.

Set `VITE_API_URL` to the deployed Worker URL in `.env.local` (or omit it for the checked-in default), then:

```sh
npm run build
node scripts/prepare-pages.mjs
```

Review and commit source, documentation, lockfile, root `index.html`, and `assets/`. Push to the existing Pages source branch (`main` on this repository). The preparation script copies only the generated release entry and assets; it does not delete older assets, allowing cached entrypoints to finish loading during rollout. `dist/` is the standalone build artifact; screenshots are in `docs/`.

Verify the Pages build status and fetch the public site. Hard-refresh once if a browser retains the earlier HTML. Test app search, an original icon, PNG/SVG export, a smart link, and a collection. Check at 390px width and in dark mode.

## Rollback and operations

Revert the release commit (do not force-reset unrelated work). Cloudflare keeps Worker versions; use the dashboard rollback controls if a backend release regresses. Keep additive D1 data intact. A frontend rollback alone must not delete existing published links.

Check Cloudflare request/error rates and D1 usage as traffic grows. Configure account budget/usage notifications yourself; this repository does not provision billing changes. The rate limiter is a per-location safeguard, not a global spending cap.

