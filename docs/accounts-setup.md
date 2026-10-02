# Enable Google and email accounts

Account UI and server endpoints are implemented, but sign-in remains disabled until the providers below are configured and tested. Search, sharing, and guest libraries do not require Supabase. PlayQR uses Supabase for authentication; app data stays in Cloudflare D1.

## Continue as guest

Choose **Continue as guest** on the Account page. No email, password, or anonymous Supabase account is created. Favorites and collection drafts stay in this browser; clearing its storage can remove them. Use Your library → Export backup to keep a copy. Shared links are stored by the backend and managed using this browser's ownership key; the backup does not include that key.

After signing in, **Import browser library** explicitly copies guest favorites and drafts into the account and transfers this browser's shared-link ownership. Guest and account libraries remain separate until you choose to import. Signed-in users should use **Sign out** before switching to the guest library.

## 1. Supabase website URLs

Open [URL Configuration for PlayQR](https://supabase.com/dashboard/project/vsbptzyozoodmsyvvbxe/auth/url-configuration).

- Site URL: `https://eyubuilds.tech/`
- Add the same exact URL to Redirect URLs: `https://eyubuilds.tech/`
- Save. Add `http://127.0.0.1:5173/` only if testing local development.

The website's `www` address redirects to the root domain. Use the root URL above for production sign-in. Avoid wildcard production redirects. See [Supabase redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls).

## 2. Continue with Google

In [Google Auth Platform](https://console.cloud.google.com/auth/overview), select or create the PlayQR project. Configure Branding (app name and contact email), Audience for your intended users, and Data Access with only `openid`, email and profile scopes. Follow Google's testing/publication requirements shown in the dashboard before general release.

Under **Clients → Create client**, choose **Web application**, then use:

| Field                        | Value                                                       |
| ---------------------------- | ----------------------------------------------------------- |
| Authorized JavaScript origin | `https://eyubuilds.tech`                                    |
| Authorized redirect URI      | `https://vsbptzyozoodmsyvvbxe.supabase.co/auth/v1/callback` |

Copy the Client ID and Client secret directly into **Supabase → Authentication → Sign In / Providers → Google**, enable the provider and save. The Google callback is the Supabase URL above, not the website URL. Never put the secret in the frontend, repository, screenshots or chat. See [Supabase's Google setup](https://supabase.com/docs/guides/auth/social-login/auth-google).

## 3. Email sign-in links through Resend

1. In Resend → Domains, add `auth.eyubuilds.tech` as a sending domain. Copy the exact DNS records Resend provides into your domain registrar, then verify the domain in Resend. Do not replace the website's existing A records or `www` CNAME. Do not invent DNS values or replace unrelated mail records.
2. Create a Resend API key authorized to send from that domain. Keep it private.
3. In Supabase → Authentication, enable Email sign-in and keep email confirmation enabled. Under **Email → SMTP Settings**, enable custom SMTP and enter:

| Setting      | Value                                         |
| ------------ | --------------------------------------------- |
| Sender email | `noreply@auth.eyubuilds.tech`                 |
| Sender name  | `PlayQR`                                      |
| Host         | `smtp.resend.com`                             |
| Port         | `465`                                         |
| Username     | `resend`                                      |
| Password     | Your Resend API key, entered only in Supabase |

Save, and keep click tracking disabled for authentication emails. PlayQR uses passwordless email links, not passwords. Leave Supabase's default confirmation/magic-link URLs intact; open the email link in the same browser that requested it (PKCE). The sending subdomain above is for email, not a Supabase custom authentication domain.

See [Resend's Supabase SMTP guide](https://resend.com/docs/send-with-supabase-smtp) and [Supabase email delivery guidance](https://supabase.com/docs/guides/auth/auth-smtp). Default Supabase email delivery is restricted and should not be used for public production sign-in.

## 4. Enable and verify

The production Worker already has the Supabase project URL and publishable key; never replace these with a secret/service-role key. Keep `AUTH_READY` set to `false` until provider setup is complete. Then set it to `true`, deploy the Worker, and complete the real sign-in checks below before announcing availability. `/auth/config` provides the public configuration to the frontend without a rebuild. If testing fails, set `AUTH_READY` back to `false` while fixing the provider settings.

For a fresh deployment, apply `0002_accounts_curation.sql` first. It is already applied to the current production database. Existing links and browser keys remain valid.

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
