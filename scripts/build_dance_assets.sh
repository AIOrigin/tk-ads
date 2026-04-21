#!/usr/bin/env bash
# Build dance template MP4s + animated WebP previews from materials/*.mp4.
# See scripts/UPLOAD_README.md for the full workflow (upload targets CloudFront).
#
# Preview pipeline: ffmpeg extracts ~3s of frames at 360px/20fps → img2webp packs
# them into an animated WebP. Two-step because Homebrew ffmpeg 8 ships without
# the libwebp encoder.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/materials"
OUT_T="$ROOT/build/dance-assets/templates"
OUT_P="$ROOT/build/dance-assets/previews"

for bin in ffmpeg img2webp; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "error: '$bin' not found on PATH" >&2
    echo "        brew install ffmpeg webp" >&2
    exit 1
  fi
done

mkdir -p "$OUT_T" "$OUT_P"

# Pairs: "<cn_template_filename>|<cn_preview_filename>|<english_slug>"
PAIRS=(
  "左右舞|企鹅左右|side-step"
  "锤锤|企鹅锤锤|hammer"
  "鬼叫|企鹅鬼叫|ghost-scream"
  "刀手|小鼠刀手|knife-hand"
  "抖抖|企鹅抖抖|wiggle"
  "踩地|企鹅踩地|stomp"
  "乱叫|企鹅乱叫|wild-yell"
  "变装舞|小鼠变装|transform"
  "举手|企鹅举手|hands-up"
  "乱舞|鼠鼠乱舞|wild-dance"
  "背对抖抖|企鹅背对抖抖|back-wiggle"
)

# ~50ms per frame × 20fps × 3s = 60 frames per preview loop
FRAME_DELAY_MS=50

for pair in "${PAIRS[@]}"; do
  IFS='|' read -r tpl prv slug <<<"$pair"

  tpl_in="$SRC/${tpl}.mp4"
  prv_in="$SRC/${prv}.mp4"

  if [[ ! -f "$tpl_in" ]]; then
    echo "error: missing template source: $tpl_in" >&2
    exit 1
  fi
  if [[ ! -f "$prv_in" ]]; then
    echo "error: missing preview source: $prv_in" >&2
    exit 1
  fi

  # Backend motion reference: copy-rename only (no re-encode, preserve source).
  cp "$tpl_in" "$OUT_T/${slug}.mp4"

  # Grid preview: extract ~3s of frames, then pack to animated WebP.
  frames_dir="$(mktemp -d -t "dance-${slug}-XXXX")"
  trap 'rm -rf "$frames_dir"' RETURN

  ffmpeg -y -loglevel error -i "$prv_in" \
    -t 3 -vf "scale=360:-2,fps=20" \
    "$frames_dir/f_%04d.png"

  img2webp -loop 0 -lossy -q 70 -m 6 \
    -d "$FRAME_DELAY_MS" "$frames_dir"/f_*.png \
    -o "$OUT_P/${slug}.webp" >/dev/null

  rm -rf "$frames_dir"
  trap - RETURN

  printf '  built  %-14s  mp4=%s  webp=%s\n' \
    "$slug" \
    "$(du -h "$OUT_T/${slug}.mp4" | awk '{print $1}')" \
    "$(du -h "$OUT_P/${slug}.webp" | awk '{print $1}')"
done

echo
echo "templates -> $OUT_T"
echo "previews  -> $OUT_P"
