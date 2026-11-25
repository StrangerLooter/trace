# TRACE — Production Deployment Guide

**Phase:** 17 — Deployment  
**Topology:** Vercel (`apps/web`) + Isolated Container Backend (`apps/api`)

---

## 1. Architecture Summary

- **Frontend (`apps/web`):** Deploy to **Vercel** (or static/Node CDN). All local identification, streaming SHA-256, JPEG/PNG sanitization, Hex Inspector, RE Mode, and JSON/CSV/PDF report exports execute inside the user's browser without requiring backend connectivity.
- **Backend (`apps/api`):** Deploy separately on container hosting (Docker, Fly.io, Google Cloud Run, or dedicated VPS) **never** inside short-lived serverless frontend handlers. Used strictly when users explicitly consent to deep PDF scrubbing, PE/ELF/ExifTool enrichment, or feedback submission.

---

## 2. Frontend Deployment (Vercel) + Custom Domain

1. Connect repository in Vercel with **Root Directory** set to `apps/web` (`sourceFilesOutsideRootDirectory: true`).
2. `apps/web/vercel.json` automatically attaches `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, and `Permissions-Policy`.
3. Set environment variables in Vercel:
   - `NEXT_PUBLIC_API_BASE_URL=https://<your-railway-or-render-backend>`
   - `NEXT_PUBLIC_ENABLE_BACKEND_ESCALATION=true` (or `false` for pure local-only deployment)
4. **Optional Custom Domain (`trace.yourdomain.dev`):**
   - Run `vercel domains add trace.yourdomain.dev --scope ram-vishwakarmas-projects`
   - Point your DNS `CNAME` (`trace`) -> `cname.vercel-dns.com`.

## 2b. Hands-Free Backend Deployment (Railway / Render)
- **Railway (Top CLI Pick):** Run `railway login` once -> `railway up apps/api` (uses `apps/api/railway.json` + `apps/api/Dockerfile` with `exiftool`, `qpdf`, `ffmpeg`, `libmagic1`, and `$PORT` binding).
- **Render (Blueprint):** Connect repo in Render -> Blueprint picks up root `render.yaml` cleanly (`rootDir: apps/api`, `/api/v1/health`).

---

## 3. Backend Deployment (Hardened Container)

Reference configuration is provided in `infrastructure/docker-compose.yml` and `apps/api/Dockerfile`.

### Key Hardening Settings
- **Non-root UID/GID:** Runs as `10001:10001`.
- **Read-only root filesystem:** `read_only: true` with RAM-backed `tmpfs` mounted at `/tmp` (`rw,noexec,nosuid,nodev,size=512m`) so scratch bytes never persist to container disk.
- **Privilege & capability drop:** `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]`.
- **Resource limits:** `1.0` CPU, `1024M` RAM (adjust upward only if increasing `TRACE_MAX_UPLOAD_MB`).
- **Health check:** `GET /api/v1/health` every `30s`.

### Required Backend Environment Variables

| Variable | Example | Purpose |
| :--- | :--- | :--- |
| `TRACE_ENV` | `production` | Disables `/docs` Swagger endpoint in production |
| `TRACE_SCRATCH_DIR` | `/tmp/trace-jobs` | Ephemeral `tmpfs` directory for UUIDv4 jobs |
| `TRACE_MAX_UPLOAD_MB` | `100` | Maximum consented upload size (`413` above cap) |
| `TRACE_JOB_TTL_SECONDS` | `600` | Orphan cleanup threshold (swept every 60s on lifespan loop) |
| `TRACE_PARSER_TIMEOUT_SECONDS` | `15` | Hard subprocess wall-clock timeout |
| `TRACE_RATE_LIMIT_PER_MINUTE` | `30` | Sliding-window per-IP `POST` request cap (`429`) |
| `TRACE_ALLOWED_ORIGINS` | `https://trace.example.com` | Exact comma-separated CORS allowlist |

---

## 4. Launch & Verification Commands

```bash
# Build and start hardened API container
cd infrastructure
docker compose up -d --build

# Verify healthcheck & security headers
curl -i http://localhost:8000/api/v1/health
```

### Licensing Verification Note
Before distributing container images publicly, inspect `ffmpeg -buildconf` inside the built `trace-api` image to verify Debian's `ffmpeg` package satisfies your LGPL/GPL redistribution obligations (or swap to a custom `--disable-gpl` FFmpeg build if strict LGPL-only distribution is required).
