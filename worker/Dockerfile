FROM python:3.12-slim

# System deps: ffmpeg, OpenCV, node (for HyperFrames npx), Chrome runtime libs.
# The Chrome libs (chrome-headless-shell deps) are required for the HyperFrames
# (Puppeteer) caption renderer — without them it silently falls back to the PIL
# renderer and animated captions are lost.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    curl \
    # chrome-headless-shell runtime libraries (Debian bookworm names)
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# HyperFrames: pin the version, bake in chrome-headless-shell so renders never
# download Chrome at runtime, and point the runtime at the real (prebuilt) manifest.
# The global install resolves the manifest to the wrong path (/usr/lib/core/dist),
# so we override it to where the package actually ships it.
ENV PRODUCER_HYPERFRAME_MANIFEST_PATH=/usr/lib/node_modules/hyperframes/dist/hyperframe.manifest.json
RUN npm install -g hyperframes@0.6.97 \
    && hyperframes browser ensure

# Build-time smoke render: prove the HyperFrames host-render path (Chrome + core
# runtime + manifest) actually works. If it doesn't, FAIL THE BUILD here rather
# than silently degrading to PIL captions in production.
RUN set -eux; \
    cd /tmp; \
    hyperframes init smoke --non-interactive --skip-transcribe; \
    cd smoke; \
    hyperframes add caption-highlight --non-interactive; \
    hyperframes render . -c compositions/components/caption-highlight.html \
        -o /tmp/smoke_out --format png-sequence --fps 5 --quality draft --quiet; \
    test -n "$(ls /tmp/smoke_out/*.png 2>/dev/null)"; \
    rm -rf /tmp/smoke /tmp/smoke_out

# Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download spaCy blank English model
RUN python -m spacy download en_core_web_sm

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
