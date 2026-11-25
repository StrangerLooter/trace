# TRACE — Privacy-First Architecture & Policy Requirements

**Phase:** 3 — Privacy Specification & Website Legal/Policy Standards  
**Core Principle:** **PROCESS LOCALLY WHEN POSSIBLE.**

---

## 1. Non-Negotiable Privacy Guarantees

1. **Local-by-Default Execution:** File identification, magic-number checks, SHA-256 hashing, hex inspection, and primary metadata parsers execute strictly inside the user's browser Web Workers.
2. **Zero Silent Uploads:** TRACE never uploads a file—or any slice of a file—to a server automatically. Any operation requiring backend tooling (e.g., `pikepdf` PDF structural scrubbing, `ExifTool` RAW MakerNotes, `FFprobe` deep streams) requires an **explicit user consent dialog** showing:
   - Exact reason backend processing is needed
   - Exact server endpoint and tools that will run
   - Ephemeral retention period (deleted immediately after completion / max 10-minute TTL)
   - One-click option to stay local with partial browser results instead
3. **Clear Server-Side Processing Indicator:** Whenever a consented backend job is active, the Workspace displays a persistent, unmistakable badge (`REMOTE SANDBOX PROCESSING — EPHEMERAL SESSION`) with a `Cancel & Delete` button.
4. **No Accounts Required:** Basic analysis, `RE Mode`, Hex Inspector, local sanitization, and JSON/CSV/PDF exports work with **zero sign-up, login, or email capture**.
5. **Zero File Data in Analytics or AI APIs:**
   - No third-party tracking pixels, ad scripts, or behavioral analytics that inspect workspace state.
   - Zero file bytes, hashes, filenames, or extracted metadata (GPS, author, serials) are ever sent to third-party AI APIs or logging SaaS tools.
   - User files are **never** used to train models.
6. **Volatile Local State by Default:** Extracted metadata, findings, and `RE Mode` logs stay in browser tab memory only—not written to `localStorage`, `IndexedDB`, or browser console logs—and vanish on `Clear File` or tab close.
7. **Reports Stay Local by Default:** JSON, CSV, and PDF exports are generated client-side (or downloaded directly from volatile state) with no server copy saved.

---

## 2. Required Website Trust, Legal & Policy Pages

To meet modern web platform standards and user transparency expectations, TRACE exposes dedicated footer-linked and navigation-accessible pages:

### 2.1 Privacy Policy (`/privacy`)
Must clearly state in plain, verifiable language:
- **What stays on your device:** Local analysis, hashes, hex inspection, JPEG/PNG local sanitization, and report generation.
- **What happens if you opt into Backend Processing:** Temporary UUIDv4 storage, automated `unlink()` after completion/download, 10-minute orphan TTL, and **honest disclosure of logical vs. physical deletion** (explaining `tmpfs`/OS `unlink()` vs. cloud SSD wear-leveling).
- **Zero third-party tracking & zero training:** Explicit commitment not to monetize, profile, or train on user files.
- **Contact / Form data:** If a user submits the optional `/contact` or format-request form, only the submitted form fields are retained for support follow-up.

### 2.2 Security & Threat Model Summary (`/security`)
Must explain:
- How TRACE treats every file as hostile (non-execution, Web Worker isolation, sanitized text rendering).
- Backend container isolation (`non-root`, `read-only` rootfs, `--network=none`, timeouts).
- Responsible Vulnerability Disclosure policy (`SECURITY.md`), security contact address, and supported versions.

### 2.3 Terms of Service & Forensic Disclaimer (`/terms`)
Must clarify:
- Permitted investigative, educational, privacy, and security research use.
- **Forensic & Accuracy Disclaimer:** TRACE is not a court-certified forensic acquisition suite; anomaly detection (e.g., trailing bytes) is an indicator requiring investigation, not legal proof of tampering or malware.
- **Sanitization Disclaimer:** Sanitization targets supported container/tag metadata only and does not remove PII embedded in visual pixels, audio speech, or document body text; users must verify critical outputs before publication.

### 2.4 Open-Source Licenses & Attributions (`/licenses`)
Must list every bundled/containerized open-source dependency with its exact license (`MIT`, `BSD-2-Clause`, `BSD-3-Clause`, `Apache-2.0`, `MPL-2.0`, `Unlicense`, `Artistic-1.0/GPL` for isolated `ExifTool` subprocess, `LGPL-2.1+` for isolated `FFprobe` subprocess) and copyright notices.

### 2.5 Contact & Feedback (`/contact`)
- Clear channels for general support, format parser requests, bug reports, and security vulnerability reporting.
- Strictly optional—never gates any analysis or export feature.
