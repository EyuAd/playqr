# Custom-domain rollout

Target website: `https://eyubuilds.tech/`, with `www.eyubuilds.tech` redirecting to the apex domain.

## Prepared

- Vite uses relative asset paths (`base: "./"`), supporting the existing `/playqr/` path and a custom-domain root.
- The Worker accepts exact HTTPS origins for `eyubuilds.tech`, `www.eyubuilds.tech`, and the existing GitHub Pages site during migration. Wildcard and HTTP access are not enabled.
- Keep `FRONTEND_URL` on the existing site until the custom domain and HTTPS are working. Authentication remains disabled with `AUTH_READY: "false"` until provider setup is complete.

## Domain-owner steps

1. Prefer verifying domain ownership in GitHub account Settings → Pages using GitHub's unique TXT record.
2. In `EyuAd/playqr` → Settings → Pages, set Custom domain to `eyubuilds.tech` **before** pointing DNS at GitHub. For a custom Actions deployment, a repository CNAME file does not configure the Pages domain.
3. Preserve existing mail and verification records. Inspect existing apex A/AAAA and www CNAME records for conflicts before making changes. Do not change nameservers or add wildcard records.
4. Add the following GitHub Pages records at the authoritative DNS provider (the root host may be represented as `@` or an empty field):

   | Type  | Host | Value           |
   | ----- | ---- | --------------- |
   | A     | @    | 185.199.108.153 |
   | A     | @    | 185.199.109.153 |
   | A     | @    | 185.199.110.153 |
   | A     | @    | 185.199.111.153 |
   | CNAME | www  | eyuad.github.io |

5. Wait for DNS validation and certificate provisioning, then enable Enforce HTTPS in GitHub Pages. DNS propagation can take up to 24 hours.

## Cutover checks

- Confirm `https://eyubuilds.tech/` loads the current release and `www` redirects correctly.
- Test Android/Apple search, original icons, direct QR links, paired smart links, shared collections, and guest link management.
- Browser-local guest data does not automatically move to a different origin. There is not yet a guest backup/import UI. Before cutover, ask whether existing guest favorites, drafts, or shared-link management keys need preservation; arrange an explicit migration or enable account sync and import the guest library on the old origin first. Do not clear old browser storage.
- Set Worker `FRONTEND_URL` to `https://eyubuilds.tech/` and deploy only after the new site works. Preserve the legacy GitHub origin during migration, and verify existing Worker smart links still resolve correctly.
- Set Supabase Site URL and its exact redirect allowlist entry to `https://eyubuilds.tech/`. Update Google's authorized JavaScript origin to `https://eyubuilds.tech`; its Supabase callback URL remains unchanged. Keep authentication disabled until Google and email delivery pass real sign-in tests.
- Email delivery on `auth.eyubuilds.tech` is a separate Resend DNS/SMTP configuration; the website records above do not enable it.

When moving PlayQR again, update the Pages domain, Worker destination, OAuth settings, and DNS together. Plan compatibility redirects for old public URLs before reusing the root domain, and remove stale hosting records when they are no longer used.

Reference: [GitHub Pages custom-domain setup](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).
