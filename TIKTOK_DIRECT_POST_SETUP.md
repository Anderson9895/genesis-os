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
