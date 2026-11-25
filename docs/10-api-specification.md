# TRACE — Backend API Specification

**Base Prefix:** `/api/v1`  
**Service:** `apps/api` (FastAPI)  
**Default Security Posture:** All responses include `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and `Cache-Control: no-store`. All `POST` routes are subject to per-IP `SlidingWindowRateLimitMiddleware` (`429 Too Many Requests` with `Retry-After: 60`).

---

## 1. `GET /api/v1/health`

Reports service liveness and availability of optional container CLI binaries (`exiftool`, `ffprobe`, `qpdf`).

**Response (`200 OK`):**
```json
{
  "status": "ok",
  "service": "trace-api",
  "env": "production",
  "tools": {
    "exiftool": true,
    "ffprobe": true,
    "qpdf": true
  }
}
```

---

## 2. `POST /api/v1/analyze`

Consented deep inspection endpoint. Streams the uploaded file into an ephemeral UUIDv4 scratch file (`/tmp/trace-jobs/<uuid>/input.bin`), executes deep Python/CLI parsers (`pypdf`, `pefile`, `pyelftools`, and `exiftool` when present), computes SHA-256, and deletes the scratch directory in `finally:`.

- **Content-Type:** `multipart/form-data` (`file`)
- **Limits:** `TRACE_MAX_UPLOAD_MB` (default `100 MB` -> `413` if exceeded); empty file -> `400`.

**Response (`200 OK`):**
```json
{
  "job_id": "uuid-v4",
  "sha256": "...",
  "size_bytes": 1024,
  "parsers_used": ["pypdf"],
  "fields": [
    {
      "id": "...",
      "fieldName": "Page Count (Deep PDF)",
      "rawKey": "PDF.PageCount",
      "value": 1,
      "displayValue": "1",
      "dataType": "number",
      "group": "pdf",
      "sourceParser": "backend:pypdf",
      "confidence": "confirmed",
      "isSensitive": false,
      "status": "valid"
    }
  ],
  "events": []
}
```

---

## 3. `POST /api/v1/sanitize`

Consented backend PDF metadata scrubbing endpoint. Verifies `%PDF-` signature, strips `/Metadata` XMP stream and `/Info` dictionary via `pypdf`, re-parses the output to verify metadata removal, deletes `input.bin` immediately, and exposes a one-time download URL.

- **Content-Type:** `multipart/form-data` (`file`)
- **Error Responses:** `400` (empty), `413` (oversized), `415` (non-PDF), `422` (encrypted PDF), `429` (rate limit).

**Response (`200 OK`):**
```json
{
  "job_id": "uuid-v4",
  "download_url": "/api/v1/jobs/<uuid>/download",
  "download_filename": "document.clean.pdf",
  "status": "removed_and_verified",
  "removed_keys": ["Author", "Creator"],
  "before_metadata": { "Author": "Alice" },
  "after_metadata": {},
  "warnings": [
    "PDF structural rewrite invalidates any prior digital signatures.",
    "Page text, annotations, and form fields remain; inspect before publishing."
  ]
}
```

---

## 4. `GET /api/v1/jobs/{job_id}/download`

One-time attachment download for sanitized output.

- Validates `job_id` strictly against UUIDv4 regex (`404` otherwise).
- Headers: `Content-Disposition: attachment; filename="..."`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `Cache-Control: no-store, no-cache, must-revalidate, max-age=0`.
- Schedules immediate `BackgroundTasks` directory deletion after response streaming completes (subsequent `GET` returns `404`).

---

## 5. `POST /api/v1/feedback`

Validates optional feedback / format request submissions (`topic`, optional `email`, `message`) without storing or logging file data.

**Request (`application/json`):**
```json
{
  "topic": "format-request",
  "email": null,
  "message": "Please add JPEG XL parser support."
}
```
