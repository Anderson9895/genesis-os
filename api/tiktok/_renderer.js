// Genesis OS — Mock campaign-video renderer.
//
// CLEARLY LABELED MOCK. No real MP4 is produced and none is claimed. The real
// rendering library is NOT installed. This module exists so the render pipeline
// contract (see renderer/RENDER_SPEC.md) is exercised and testable end-to-end,
// while remaining 100% honest: it never fabricates a video, a URL, or success.
//
// It will never be ingested by TikTok.

export function renderCampaignVideo({ post }) {
  const errors = []
  if (!post || !post.id) errors.push('post is required')
  if (post && post.status !== 'approved') {
    errors.push(`render refuses non-approved status "${post.status}" — only approved packages render`)
  }

  if (errors.length) {
    return {
      ok: false,
      rendered: false,
      mock: true,
      errors,
      url: null,
      note: 'No real render attempted. Approve the package first and / or install a real renderer.',
    }
  }

  return {
    ok: true,
    rendered: false, // honesty: nothing was actually rendered
    mock: true,
    format: '1080x1920 MP4 (H.264/AAC, 9:16, voiceless) — SPEC ONLY, mock produced no file',
    url: null,
    postId: post.id,
    note: 'This is a clearly-labeled mock. A real MP4 is produced only when a verified renderer is installed. Nothing here can be posted to TikTok.',
  }
}
