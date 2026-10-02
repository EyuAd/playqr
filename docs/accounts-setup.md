# Enable Google and email accounts

Account UI and server endpoints are implemented, but remain disabled until a Supabase project is configured. Search, sharing, and guest libraries do not require Supabase.

1. Create a Supabase project. Use its Project URL and **publishable** (`sb_publishable_...`) key. Do not use a secret or service-role key. PlayQR uses Supabase only for authentication; app data stays in Cloudflare D1.
2. Set Auth → URL Configuration → Site URL to `https://eyuad.github.io/playqr/`. Add this exact URL to Redirect URLs. Add `http://127.0.0.1:5173/` for development only.
3. Email provider: enable email sign-in and configure a production SMTP provider. Supabase's default email delivery is restricted and is not a public production email service. Keep confirmation enabled. PlayQR uses email magic links with PKCE: open the sign-in email in the same browser that requested it.
4. Google provider: create a Google OAuth web client. Use the callback URL shown by Supabase (`https://PROJECT.supabase.co/auth/v1/callback`) as the authorized redirect URI, and the website origin `https://eyuad.github.io` as the authorized JavaScript origin. Add the client ID and client secret **in Supabase**, not the frontend or Git repository. Configure the Google consent screen and permitted test users before testing; complete production publication as required by Google.
5. Set Worker variables `SUPABASE_URL` (without trailing slash) and `SUPABASE_PUBLISHABLE_KEY`. Keep `AUTH_READY` set to `false` while provider and redirect setup is incomplete; set it to `true` for the final sign-in verification and rollout. Deploy the Worker. The frontend discovers the public configuration via `/auth/config`; it does not need a rebuild.
6. Apply `0002_accounts_curation.sql` before deploying the new Worker. It adds presentation fields, public profiles, and revisioned cloud libraries. Existing links and browser keys remain valid.

## Release checks

- Complete a real Google sign-in and email sign-in on desktop and mobile.
- Save a favorite and collection on one device; verify the other loads them.
- Confirm sign-out returns to the separate guest library.
- Verify a second account cannot read or modify the first account's library, links, or analytics.
- Create a profile; publish one listed and one unlisted collection. Only the listed collection should appear publicly.
- Concurrent draft changes must raise a conflict instead of silently overwriting another device. Account → Reload cloud copy is an explicit discard of unsynced changes, not an automatic merge.
- Import browser library explicitly to transfer guest links. Clearing local storage can lose unsynced edits; sync status must show success first.

Account integration tests use an isolated mock identity provider. Passing them does not verify production Google consent, email delivery, or redirect configuration.

References: [Google provider](https://supabase.com/docs/guides/auth/social-login/auth-google), [email magic links](https://supabase.com/docs/guides/auth/auth-email-passwordless), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
