<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project Services

- PostHog project: `tiktok-ad` (project ID `330834`).

## Analytics Notes

- For TikTok traffic validation, compare ad clicks against PostHog `$pageview` on `https://dance.elser.ai`, not the delayed `view_content` event.
- `view_content` is a softer engagement signal because it fires after the landing page has been visible for 1 second.
- The current TikTok setup may contain multiple ads inside a single ad group. Do not assume each `utm_id` is a separate ad group.
- In the setup described on 2026-04-23, one ad group contains four ads differentiated by suffix letters `A`, `B`, `C`, and `D`.
