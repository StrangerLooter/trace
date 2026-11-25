# TRACE — Universal File Intelligence & Digital Forensics Platform

> **Look Beyond the File.**  
> Inspect true binary signatures, embedded metadata, multi-layer timestamp trails, privacy risks, and raw byte offsets—locally in your browser by default.

**Architect & Lead Engineer:** [Ram Vishwakarma (@StrangerLooter)](https://github.com/StrangerLooter)  
**Repository:** [github.com/StrangerLooter/trace](https://github.com/StrangerLooter/trace)  
**Live Frontend (Vercel):** [trace-opal-gamma.vercel.app](https://trace-opal-gamma.vercel.app)  
**Live Sandbox API (Railway):** [trace-api-production-b6111baf.up.railway.app](https://trace-api-production-b6111baf.up.railway.app/api/v1/health)

---

## Why TRACE?

Most file viewers trust filename extensions, blur filesystem dates with internal capture metadata, or upload sensitive files to third-party servers before inspecting them. **TRACE** flips that model:

1. **Zero Silent Uploads:** Signature verification, Web Worker metadata parsers, deterministic forensics, lossless JPEG/PNG sanitization, virtualized hex inspection, and streaming SHA-256 (`hash-wasm`) run locally inside isolated browser Web Workers.
2. **Evidence Over Black-Box Claims:** Extracted tags link to verified byte coordinates (`byteRange`) in the **Hex Inspector** (`0x00000000` jump-to-offset) or explicitly report `Offset N/A` instead of guessing.
3. **Forensic Honesty:** Every format declares its exact inspection and sanitization tier (`fully_supported` down to `unsupported`) in `@trace/parser-registry`. Formats that cannot be safely cleaned locally refuse silent claims of sanitization.

---

## Core Capabilities

- **True Binary Signature Engine (`@trace/file-signatures`):** Evaluates magic bytes across 25+ formats (`JPEG`, `PNG`, `WebP`, `TIFF`, `GIF`, `HEIC`/`AVIF`, `MP3`, `WAV`, `FLAC`, `OGG`, `MP4`/`MOV`, `MKV`/`WebM`, `PDF`, `ZIP`/`DOCX`/`XLSX`/`PPTX`/`ODT`, `PE`, `ELF`, `Mach-O`, `SQLite`, etc.), detects extension-vs-binary spoofing, and drills into nested `ZIP`, `ISOBMFF`, `RIFF`, and `EBML` containers.
- **Mobile & Screen-Recording Forensics (`HEIC`/`AVIF` + `MKV`/`WebM`):** Parses ISOBMFF `meta`/`ispe`/`irot` + embedded EXIF TIFF inside smartphone `HEIC`/`AVIF` images, and extracts EBML Segment Info (`WritingApp`, `MuxingApp`, `DateUTC`), Tracks, codecs, and Tags from `MKV`/`WebM` recordings while skipping Cluster payloads in O(1).
- **Dual Inspection Workspace (`/workspace`):**
  - **Analysis Mode:** Overview & safe bitmap preview (`createImageBitmap` raster-only, never inline SVG/HTML/PDF execution), filterable & searchable Metadata groups, Explainable Forensics (`Informational`–`Critical`), Format-Specific Sanitizer, and versioned **JSON / formula-safe CSV / A4 PDF** exports.
  - **RE (Reverse Engineering) Mode:** Live 22-type diagnostic event stream (`TRACE_EVENT_TYPES`, 5,000-event bounded ring buffer), structural region breakdown, and byte-level jump links.
- **5 GiB+ Streaming & Virtualized Hex Inspector (`@trace/binary-core`):** Reads bounded slices via `Blob.slice()` (`DEFAULT_MAX_SLICE_BYTES`) with paging (`2 KB` windows), `8`/`16` bytes-per-row responsive layout, hex/ASCII search, and live Multi-Type Data Inspector (`uint8`–`int32`, LE/BE, UTF-8).
- **Isolated Python Sandbox API (`apps/api`, Optional Explicit Consent):** FastAPI service hardened for containerized execution (non-root UID `10001`, read-only rootfs + `tmpfs`, `cap_drop: ALL`, `shell=False` subprocesses, sliding-window rate limiter, UUIDv4 ephemeral jobs, `1x` safe downloads) for deep `pypdf`/`qpdf`/`pefile`/`pyelftools`/`exiftool` inspection and PDF scrubbing.

---

## Multi-Layer Timestamp & Messenger Forensics

When investigating media received through messengers (such as **WhatsApp**), TRACE preserves visibility across **two independent layers**:

| Layer | Where It Lives | Example Scenario (Shot Nov 22 -> Sent via WhatsApp Nov 25 -> Saved to PC Nov 25) |
| :--- | :--- | :--- |
| **1. OS / Filesystem Shell** | Operating system (`lastModified`, file creation) | Shows **Nov 25** (when the file was downloaded/written to the receiver's disk). |
| **2. Embedded Forensic Payload** | Inside binary headers (`EXIF DateTimeOriginal`, `XMP`, `PDF CreationDate`) | **Sent as Standard Image:** WhatsApp strips EXIF/GPS & re-encodes -> only Nov 25 OS date + structural clues remain.<br>**Sent as Document / Original Transfer:** Embedded EXIF permanently retains **Nov 22** capture time, camera hardware & GPS while OS shows **Nov 25**. |

TRACE's deterministic rule engine (`@trace/forensics`) cross-references capture vs. container/modification timestamps to flag date discrepancies, software edit trails, GPS leakage, author/email exposure, ZIP traversal/ratio anomalies, and trailing bytes past EOF.

---

## Monorepo Architecture

```text
.
├── apps/
│   ├── web/                 # Next.js 15 App Router UI, Tailwind v4, Zustand, Web Workers
│   └── api/                 # Optional Python FastAPI deep-inspection & PDF scrubber service
├── packages/
│   ├── shared-types/        # Canonical TypeScript schemas (MetadataField, ForensicFinding, Coverage)
│   ├── binary-core/         # Bounded BinaryReader & Blob.slice() range adapters
│   ├── file-signatures/     # Magic-byte rules, container probes & extension mismatch detector
│   ├── parser-registry/     # Capability matrix & parser planner
│   ├── parsers/             # JPEG, PNG, WebP, TIFF, MP3, WAV, MP4, PDF, ZIP/Office, PE, ELF parsers
│   ├── forensics/           # Deterministic privacy & structural integrity rules
│   ├── sanitizers/          # Lossless JPEG/PNG local scrubbers & honest capability guards
│   ├── event-system/        # 22-type RE Mode event model & bounded emitter
│   └── report-schema/       # Versioned JSON, neutralized CSV & pdf-lib A4 PDF export
├── infrastructure/          # Hardened Docker Compose & FastAPI deployment stack
└── docs/                    # Architecture, threat model, parser design & QA documentation
```

---

## Quick Start

### Prerequisites
- **Node.js** `22+` and **pnpm** `10+`
- **Python** `3.12+` (only required if running the optional `apps/api` deep-scan backend)

### 1. Frontend & Workspace Packages (`apps/web`)
```bash
pnpm install
cp .env.example apps/web/.env.local   # Optional: set NEXT_PUBLIC_API_BASE_URL
pnpm dev:web
```
Open `http://localhost:3000` (or pass `-p 3015` if port 3000 is busy).

### 2. Optional Isolated Backend API (`apps/api`)
```bash
cd apps/api
python -m venv .venv
# Linux/macOS: source .venv/bin/activate | Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
Or run via hardened Docker Compose (`infrastructure/docker-compose.yml`):
```bash
cd infrastructure && docker compose up -d --build
```

---

## Verification & Observed Benchmarks

Run the workspace verification suites:
```bash
pnpm typecheck      # TypeScript check across all 10 workspace projects
pnpm test:ts        # Vitest suite (13 test files, 50 tests)
pnpm build:web      # Production Next.js build (13 static routes)
ruff check apps/api # Python lint check
pnpm test:api       # FastAPI pytest suite (13 tests)
```

- **5 GiB Sparse MP4 Benchmark (`packages/parsers/src/perf-5gb.test.ts`):** Signature ID `< 4 ms`, atom tree parse `< 10 ms`, `65,604 B` total bounded I/O.
- **Streaming SHA-256 (`hash-wasm`):** Processes multi-megabyte streams in bounded `16 MiB` slices with negligible JS heap delta.
- **Dependency Hygiene:** `pnpm audit --prod` verified clean (`0` known vulnerabilities).

---

## Deployment (Vercel + Railway / Render)

### Frontend on Vercel (`apps/web`)
1. Set the Vercel Project **Root Directory** to `apps/web` (already linked to `StrangerLooter/trace` with `sourceFilesOutsideRootDirectory: true`).
2. Security response headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`) are enforced automatically via [`apps/web/vercel.json`](apps/web/vercel.json).
3. To enable consented server-side deep inspection in production, set in Vercel:
   - `NEXT_PUBLIC_API_BASE_URL=https://trace-api-production-b6111baf.up.railway.app`
   - `NEXT_PUBLIC_ENABLE_BACKEND_ESCALATION=true`

### Backend Sandbox Container on Railway / Render (`apps/api`)
`apps/api/Dockerfile` ships with `exiftool`, `qpdf`, `ffmpeg`, `libmagic1`, dynamic `$PORT` binding, and non-root execution (`10001:10001`), with CORS pre-configured for `https://trace-*.vercel.app`:
- **Railway (Live):** Deployed via [`apps/api/railway.json`](apps/api/railway.json) (`railway up ./apps/api --path-as-root --service trace-api`) at `https://trace-api-production-b6111baf.up.railway.app`.
- **Render:** Connect the repo as a Blueprint using [`render.yaml`](render.yaml) (auto-deploys `apps/api` Docker image with `/api/v1/health`).

---

## Documentation

- [Project Status](PROJECT_STATUS.md) & [Final Quality Review](docs/15-final-quality-review.md)
- [System Architecture](docs/03-system-architecture.md) & [Data Flow](docs/04-data-flow.md)
- [Format Support Registry](docs/05-file-format-support.md) & [Known Limitations](docs/14-known-limitations.md)
- [Security Threat Model](docs/07-security-threat-model.md) & [Deployment Guide](docs/13-deployment-guide.md)

## License & Disclaimer

Licensed under the [MIT License](LICENSE). TRACE is built for investigative, educational, and privacy-auditing workflows and is not a court-certified forensic acquisition suite.
