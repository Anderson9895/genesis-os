# TikTok Direct Post setup

Genesis OS now contains a real TikTok operations queue and official Content Posting API integration. It does not claim that TikTok is connected until the required account authorization and server settings exist.

## Already implemented

- Owner-only `tiktok_posts` table with RLS and no anonymous access.
- Draft, approval, schedule, upload, processing, published, private-test, failure, and owner-action states.
- Per-video owner approval before any API call.
- Creator-info query before Direct Post.
- `PULL_FROM_URL` video initialization through TikTok's official endpoint.
- Publish-status polling and duplicate-post protection.
- Public posting locked until `TIKTOK_AUDIT_APPROVED=true`.

## Required one-time TikTok work

1. Register a web app at TikTok for Developers.
2. Add Login Kit and the Content Posting API.
3. Register the production redirect URI shown in `.env.example`.
4. Request and obtain the `video.publish` scope.
5. Verify `genesis-os-phi.vercel.app` or the exact media URL prefix used for hosted MP4 files.
6. Authorize the campaign TikTok account.
7. Complete TikTok's audit. Until then, API-created posts are private-only.
8. Store all credentials as encrypted Vercel server environment variables. Never put them in GitHub, browser code, campaign documents, or chat.

## Posting workflow

1. Render a faceless 9:16 MP4 and host it under the verified URL prefix.
2. Add the MP4, caption, schedule, privacy choice, and interaction settings in **TikTok Operations**.
3. Review and explicitly approve the final record.
4. Use **Direct Post**. Genesis OS queries the latest creator settings and rejects privacy choices that TikTok does not currently permit.
5. Refresh status until TikTok returns a final result.

No automatic public scheduler should be enabled until the manual workflow has completed successfully and TikTok's audit status is verified.

## Additive build (feature/tiktok-direct-post-complete)
Built additively on the merged base. INTERNAL BUILD ONLY — nothing is live, nothing was posted publicly.
- **OAuth flow (not live):** `GET /api/tiktok/connect` builds the video.publish authorization URL (503 until the app is registered). `GET|POST /api/tiktok/oauth/callback` exchanges the code server-side using the server-only client secret. Tokens never enter the browser, repo, logs, chat, or campaign files.
- **Secure token vault seam:** `api/tiktok/tokenStore.js` — server-side only, optional AES-256-GCM encryption-at-rest via `TIKTOK_TOKEN_ENCRYPTION_KEY`. Reports `configured:false` until a real registered app + live authorized credentials exist. `getTikTokConfig` reads the token through the vault.
- **Renderer (MOCK, clearly labeled):** `renderer/RENDER_SPEC.md` (spec) + `renderer/mock-renderer.js` + `POST /api/tiktok/render`. It never produces or claims a real MP4 and never flips status to "rendered".
- **Scheduler:** `GET/PUT /api/tiktok/settings` (owner daily time + auto-publish toggle, off by default) and `GET /api/tiktok/schedule` (marks each day `needs approval` when no approved video exists; never posts filler; never duplicates). Auto-publish only runs when connected + audit-approved + owner-enabled.
- **Webhook:** `POST/GET /api/tiktok/webhook` ingest + `tiktok_webhook_events` audit table (in migration). Acknowledges events; persisting owner rows requires a service-role write path not yet configured — verified via user-authenticated polling (`POST /api/tiktok/publish-status`).
- **Data model:** additive `supabase/migrations/20260830_tiktok_extensions.sql` (adds `rendered` state, status_history, disclosure/cover columns, `tiktok_settings`, `tiktok_webhook_events`, RLS). **NOT yet applied/verified** — the engineer session had no SQL access.
- **UI:** `TikTokOperations` page now shows a prominent LOCK banner, scheduler/calendar+needs-approval, renderer mock info, disclosure/cover toggles, and per-video owner-approval records.
- Full, real connection still requires: registered app, video.publish scope approval, domain verification, audit, and account authorization (owner actions per checklist).
