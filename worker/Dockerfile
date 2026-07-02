# UNVEILED worker — Docker build so ffmpeg (with drawtext/libfreetype) + fonts
# are guaranteed present for the Video Assembly Service. Railway uses this
# Dockerfile automatically when the service root is worker/.
FROM python:3.13-slim

# ffmpeg (with libfreetype drawtext) + a TTF font for captions/CTA text.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

# stdlib-only Python; no pip deps. Runs heartbeat + builder + render.
CMD ["python", "worker_main.py"]
