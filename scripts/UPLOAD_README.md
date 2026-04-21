# Dance asset upload

How to produce the 11 dance template MP4s + animated WebP previews and publish them behind `assets.tool.elser.ai`.

## Prerequisites

- `ffmpeg` and `img2webp` on PATH — `brew install ffmpeg webp` (tested with ffmpeg 8.0.1 + libwebp 1.6.0). The script uses `img2webp` because Homebrew's ffmpeg 8 ships without the libwebp encoder.
- `aws` CLI configured for account `442090679914` (same account used for `elser-tool-s3-*`).
- Source files present at `tk-ads/materials/*.mp4` (the 25 Chinese-named clips — only 22 are referenced, 3 are unused by design).

## Step 1 — build locally

```bash
cd tk-ads
bash scripts/build_dance_assets.sh
```

Outputs:

- `build/dance-assets/templates/*.mp4` — 11 clean motion-reference videos (renamed copies, no re-encode). These are what the backend receives as `motion_video_url`.
- `build/dance-assets/previews/*.webp` — 11 animated WebPs shown in the "Choose a dance" grid (3s loops, 360px wide, 20fps).

Slugs: `side-step, hammer, ghost-scream, knife-hand, wiggle, stomp, wild-yell, transform, hands-up, wild-dance, back-wiggle`.

## Step 2 — confirm S3 bucket

The CDN `assets.tool.elser.ai` is a CloudFront distribution in front of an S3 bucket. The infra naming convention (`elser-infrastructure/service/tool/s3.tf`) is `elser-tool-s3-{env}-{region_short}`. Prod is expected to be `elser-tool-s3-prod-uses1`. Verify:

```bash
aws s3 ls | grep elser-tool
```

If the name differs, adjust the commands below.

CloudFront origin path is `/public` (`elser-infrastructure/service/tool/cloudfront.tf`), so an object at key `public/community/ai-pet-dance/motions/previews/hammer.webp` is served at `https://assets.tool.elser.ai/community/ai-pet-dance/motions/previews/hammer.webp`.

## Step 3 — upload

Templates (mp4):

```bash
aws s3 sync build/dance-assets/templates/ \
  s3://elser-tool-s3-prod-uses1/public/community/ai-pet-dance/motions/templates/ \
  --content-type video/mp4 \
  --cache-control "public, max-age=31536000, immutable"
```

Previews (webp):

```bash
aws s3 sync build/dance-assets/previews/ \
  s3://elser-tool-s3-prod-uses1/public/community/ai-pet-dance/motions/previews/ \
  --content-type image/webp \
  --cache-control "public, max-age=31536000, immutable"
```

`aws s3 sync` is idempotent — re-running uploads only changed files.

## Step 4 — verify via CDN

```bash
for slug in side-step hammer ghost-scream knife-hand wiggle stomp wild-yell transform hands-up wild-dance back-wiggle; do
  for kind in previews/${slug}.webp templates/${slug}.mp4; do
    printf '%s  ' "$kind"
    curl -sIo /dev/null -w "%{http_code}  %{size_download}\n" \
      "https://assets.tool.elser.ai/community/ai-pet-dance/motions/${kind}"
  done
done
```

All rows must be `200`. If a freshly-uploaded file returns `403`, wait 1–2 minutes for S3 to propagate and try again.

## Step 5 — smoke test the frontend

```bash
cd tk-ads
npm run dev
```

Open http://localhost:3000. In the "Choose a dance" row:

- Each tile should show a looping penguin/mouse animation (WebP), not raw motion footage.
- In DevTools Network, tile fetches should hit `community/ai-pet-dance/motions/previews/*.webp` with 200s.
- On "Create", the request to `/api/generate` (or `/api/generate-free`) must contain `motion_video_url=...v2/templates/{slug}.mp4` (the MP4, not the WebP).
