# Genesis OS — Campaign Video Renderer (spec)

**Campaign:** "6,000 Strangers. One Question." — faceless, voiceless 9:16 Mifflin MP4s.

This document is the **render pipeline specification**. A real renderer is not
installed (no ffmpeg/Canvas/ffmpeg.wasm render dependency is vendored), so the
code that ships is a clearly-labeled **mock**. It never produces or claims a
real video. When a rendering library is added and verified, implementers follow
this spec.

## Output contract
- **Container/codec:** MP4 (H.264 + AAC), 1920x1080 → output **1080x1920 (9:16)**, ~30fps.
- **Duration:** ~15–30s (owner/approved copy dependent).
- **No audio** (voiceless). No woman's identity, face, name, or location anywhere.

## Faceless visual treatment
- Clean gradient or abstract background (royalty-safe/original — no copyrighted assets).
- **Large, readable text** (safe margins ≥10%; ≥48–72px effective) carrying the day's message.
- Optional: simple geometric accent; no people, no photos of the woman, no brand logos.

## Content requirements (from posting policy)
- Accurate fundraiser progress **only from verified data** — the renderer must be
  fed a verified progress figure (from the campaign ledger), never invent one.
- Sponsorship disclosures when applicable (none exist yet).
- No deception, no raffle/prize/charitable-deduction/donor-benefit claims,
  no "she is famous" implications.

## Renderer input (the approved package)
The renderer consumes an **approved** `tiktok_posts` record:
`title`, `caption`, `cover_url` (optional), verified progress fields, disclosure flags.
A render is only meaningfully produced for an `approved` post. Drafts render nothing.

## Pipeline (to be implemented)
1. Compose scenes from the approved text package.
2. Draw text + background to frames (Canvas/ffmpeg drawtext or server-side lib).
3. Encode 1080x1920 H.264/AAC MP4.
4. Host the MP4 under the **verified** URL/domain prefix (`media_url`).
5. Store `media_url`, mark post `rendered`.

## Mock-renderer behavior (what actually ships)
- `mock-renderer.js` accepts the same approved input and returns a **mock object**
  that declares `rendered: false`, `mock: true`, `media_url: null`, and a note that
  no real MP4 was produced. It deliberately does **not** fabricate an MP4, a URL,
  or a successful render. It will never be pushed to TikTok.
- If the post is not `approved`, it refuses with a clear error.
