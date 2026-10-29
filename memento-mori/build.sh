#!/usr/bin/env bash
# Полная сборка ролика: звук -> кадры -> mux в MP4.
# Выход: memento-mori.mp4 (1920x1080, 60 fps, H.264/yuv420p, AAC).
set -euo pipefail
cd "$(dirname "$0")"

echo "[1/3] audio -> audio.wav"
node audio.js

echo "[2/3] frames -> frames/*.png"
node render.js --workers "${WORKERS:-4}"

echo "[3/3] mux -> memento-mori.mp4"
ffmpeg -y -hide_banner -loglevel warning -thread_queue_size 512 \
  -framerate 60 -i frames/f%05d.png \
  -i audio.wav \
  -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
  -movflags +faststart \
  -c:a aac -b:a 192k -ar 44100 \
  -r 60 memento-mori.mp4

ffprobe -hide_banner memento-mori.mp4 2>&1 | grep -E "Duration|Stream"
