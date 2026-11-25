FROM python:3.13-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# Install minimal runtime tools; verify LGPL ffmpeg/qpdf/exiftool packages in image SBOM
RUN apt-get update && apt-get install -y --no-install-recommends \
    libmagic1 \
    qpdf \
    exiftool \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 10001 trace \
    && useradd --uid 10001 --gid 10001 --create-home --shell /usr/sbin/nologin trace

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
RUN mkdir -p /tmp/trace-jobs && chown 10001:10001 /tmp/trace-jobs && chmod 0700 /tmp/trace-jobs

USER 10001:10001
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import os, urllib.request; port = os.environ.get('PORT', '8000'); urllib.request.urlopen(f'http://127.0.0.1:{port}/api/v1/health', timeout=3)" || exit 1

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
