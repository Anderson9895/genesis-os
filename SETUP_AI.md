# Genesis OS AI Cloud Setup (Vercel)

This guide enables Cloud AI Mode securely while preserving Local Free Mode.

## Security Rules

1. Never add provider API keys to frontend code.
2. Never store provider API keys in Vite variables (`VITE_*`).
3. Add provider keys only in Vercel Project Environment Variables.
4. Keep `.env.local` out of Git (already ignored).

## 1. Required Server Environment Variables (Vercel)

In Vercel Project Settings -> Environment Variables, add:

- `SUPABASE_URL` = your Supabase project URL
- `SUPABASE_ANON_KEY` = your Supabase anon publishable key

For Cloud AI providers, add one or both:

- `OPENAI_API_KEY` = your OpenAI server API key
- `ANTHROPIC_API_KEY` = your Anthropic server API key

Do not add provider keys as `VITE_OPENAI_API_KEY`, `VITE_ANTHROPIC_API_KEY`, or any other `VITE_*` variable.

## 2. Apply Supabase SQL Migration

In Supabase SQL Editor, run [supabase/rls-migration.sql](supabase/rls-migration.sql).

This migration includes:

- existing Genesis OS tables and RLS
- `companion_ai_settings` for per-user AI mode/provider/model/caps
- `companion_ai_usage` for usage estimation and spending tracking

## 3. Deploy to Vercel

1. Push to `main`.
2. In Vercel, trigger a redeploy (or push triggers deployment automatically).
3. Verify deployment logs do not print secret values.

## 4. Configure AI Mode in App

1. Sign in to Genesis OS.
2. Open Admin AI Settings.
3. Keep **Preferred Mode = Local Free Mode** for zero-cost operation.
4. Switch to **Cloud AI Mode** only after provider key is set in Vercel.
5. Set monthly token cap and spending limit.
6. Click **Test Connection**.

## 5. Fallback Behavior

- If Cloud AI provider is unavailable, Genesis Companion automatically returns to Local Free Mode.
- If monthly cap or spending limit is reached, the app falls back to Local Free Mode.

## 6. Local Development Notes

For local development, `.env.local` can include Supabase client values only:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Do not place provider API keys in `.env.local` if they use `VITE_*` names. The secure cloud path is server-only via Vercel environment variables.
