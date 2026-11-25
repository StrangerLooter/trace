# TRACE — Security Threat Model & Defense-in-Depth Architecture

**Phase:** 3 — Security Design  
**Status:** Proposed for Review  
**Core Assumption:** Every file opened locally or uploaded with consent is **potentially hostile**. Security relies on layered defense-in-depth—never a single MIME check or parser boundary.

---

## 1. Trust Boundaries

| Boundary | Untrusted Input | Protected Asset | Enforcement Controls |
| :--- | :--- | :--- | :--- |
| **B1: File -> Browser Web Worker** | Local `File` / `Blob` bytes | Browser tab stability, UI thread, host RAM | Bounded `Blob.slice()` reads, max slice cap (`16 MB`), cycle/depth limits in IFD/box walkers, `AbortSignal`, `worker.terminate()`. |
| **B2: Worker Output -> React DOM / Exports** | Extracted metadata strings, filenames, tags | User browser origin, DOM integrity, downstream Excel/PDF viewers | Strict React text-node escaping (zero `dangerouslySetInnerHTML`), strict CSP, CSV formula-prefix neutralization, never render untrusted SVG/HTML/PDF inline. |
| **B3: Client -> FastAPI Gateway** | Consented upload stream, `job_id`, API parameters | Backend host availability, disk, bandwidth, other users' jobs | TLS-only, rate limiting, per-request size cap, UUIDv4 job IDs, `Origin`/CSRF checks, zero ambient cookie auth. |
| **B4: FastAPI -> Isolated Parser Sandbox** | `/tmp/trace-jobs/<uuid>/input.bin` | Host kernel, filesystem, internal network, adjacent jobs | Non-root UID, read-only rootfs, `--cap-drop=ALL`, `no-new-privileges`, seccomp profile, `--network=none`, `ulimit` RAM/CPU/fsize, hard timeout + `SIGKILL`. |
| **B5: Backend Output -> Client Download** | Sanitized output file bytes | User machine & browser origin | Separate download origin (or strict isolated response), `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, `CSP: sandbox`, `Cache-Control: no-store`. |

---

## 2. Defense-in-Depth Controls Matrix

1. **Zero trust in filename, extension, or `Content-Type`:** Ingestion assigns `input.bin` inside `/tmp/trace-jobs/<uuid>/`; parser selection uses binary signatures.
2. **Server-side random identifiers:** All job IDs use `uuid.uuid4()`; user-supplied IDs in `/jobs/{job_id}/download` are validated strictly as UUIDv4 regex before filesystem lookup.
3. **Uploads outside public web root:** Scratch lives in dedicated non-served `/tmp/trace-jobs/` with `0700` directory permissions.
4. **Hard size, time, CPU, memory & concurrency limits:**
   - Default consented upload limit: configurable (e.g., `100 MB` standard tier; `500 MB`–`2 GB` bounded streaming tier only when dedicated scratch quota allows).
   - Wall-clock parser timeout: `15s` (metadata) / `60s` (remux/sanitize), followed by `SIGKILL` of the process group.
   - Worker concurrency cap (`asyncio.Semaphore` / worker pool ceiling) + `RLIMIT_AS` (e.g., `512 MB`–`1 GB` per parser subprocess) and `RLIMIT_CPU`.
5. **Container & OS hardening:**
   - Non-root user (`UID 10001`), `--read-only` root filesystem with bounded `tmpfs` (`nosuid,nodev,noexec`).
   - `--cap-drop=ALL`, `--security-opt=no-new-privileges:true`, Docker default/custom **seccomp** profile blocking `ptrace`, `mount`, `bpf`, `kexec_load`, etc.
   - Outbound network disabled (`--network=none`) for parser/worker containers so parsers cannot perform DNS or HTTP callbacks.
6. **XML / XXE / Entity Expansion protection:**
   - Frontend: `fast-xml-parser` configured with `processEntities: false` and DTD rejection.
   - Backend: `defusedxml` exclusively for any XML parsing (XMP, Office `core.xml`/`app.xml`, SVG); `lxml` external entity & network resolution explicitly disabled (`resolve_entities=False, no_network=True`).
7. **ZIP & decompression bomb protection:**
   - Inspect ZIP central directory headers first without inflating payloads.
   - Enforce maximum entry count (`<= 10,000`), maximum compressed-to-uncompressed ratio (`<= 100:1`), maximum single-entry read (`<= 16 MB` for XML metadata), and total inflated byte counter (`<= 64 MB` in-browser).
8. **Archive extraction & symlink protection:**
   - TRACE **never extracts untrusted archives to disk**. If a future P2 backend inspector unpacks entries in memory or temp dir, reject `..`, absolute paths, drive prefixes, and symlink mode bits (`S_ISLNK`), and assert `os.path.realpath(target).startswith(safe_base + os.sep)`.
9. **Command injection prevention:**
   - All subprocesses (`exiftool`, `ffprobe`, `ffmpeg`) execute via `subprocess.run([binary, "--", safe_path], shell=False)`.
   - Never pass user filenames or metadata into shell strings; always pass `--` before paths (or pass fixed `input.bin` relative to job dir) so leading `-` characters cannot act as CLI flags.
10. **Dependency & vulnerability hygiene:** Automated `npm audit` / `pip-audit` in CI, pinned lockfiles, and minimal dependency surface.
11. **Malware scanning boundary:** TRACE never executes uploaded binaries or macros; optional backend `ClamAV` triage may be added in P2 as an informational layer, while clearly documenting that TRACE is not an endpoint antivirus replacement.
12. **CSRF & Abuse prevention:** Backend API avoids ambient cookie authentication; enforce strict `CORS` allowlist, `Origin` check on state-changing requests, and sliding-window IP rate limits (e.g., `20 req/min` analyze, `10 req/min` sanitize, `5 req/min` contact form).
13. **Zero PII leakage in logs:** Structured backend logs record `{ timestamp, job_id, status_code, duration_ms, parser_id, error_code }`—never filenames, IP raw logs beyond rate-limiter memory, file bytes, or extracted metadata values.
14. **Never render untrusted active content inline:** Uploaded SVGs, HTML, PDFs, or images are never served inline from the application's origin. Local browser image previews use safe raster decoding (`createImageBitmap` / `<canvas>` for JPEG/PNG/WebP only—**never** `<img src="blob:">` for SVG or raw HTML!).

---

## 3. Temporary File Lifecycle & Deletion Semantics

```text
[Upload Stream] -> /tmp/trace-jobs/<uuid>/input.bin (mode 0600, dir 0700)
       |
       +--> [Subprocess Parse / Sanitize -> output.bin]
       |
       +--> [try / finally block]
               |-- On analysis complete/error -> shutil.rmtree(/tmp/trace-jobs/<uuid>, ignore_errors=True)
               |-- On sanitize complete       -> keep output.bin briefly for one-time GET /download
               |-- On GET /download complete  -> unlink output.bin & rmtree immediately
               +-- Crash / SIGKILL fallback   -> Background Sweeper (every 60s) removes any dir > 10m old
```

### Logical Deletion vs. Physical Erasure (Transparency Requirement)
- Deleting via `unlink()` / `rmtree()` immediately removes OS filesystem references and frees space in `tmpfs`/disk, preventing access by the application or subsequent jobs.
- Where `tmpfs` (RAM-backed) is used for small/medium backend scratch, data never touches persistent physical SSD blocks unless swapped (disable swap in container host).
- Where disk/cloud block storage is used for larger ephemeral files, SSD wear-leveling and cloud hypervisor layers prevent guaranteeing instant physical block overwrite; this distinction is explicitly documented in [08-privacy-policy-requirements.md](08-privacy-policy-requirements.md).

---

## 4. Secure Download Architecture

When downloading a sanitized file from the backend (`GET /api/v1/jobs/{job_id}/download`):
- **Headers:**
  - `Content-Disposition: attachment; filename="<sanitized_ascii_name>"` (strip CR/LF, quotes, path separators, control chars)
  - `X-Content-Type-Options: nosniff`
  - `Content-Security-Policy: default-src 'none'; sandbox`
  - `Cache-Control: no-store, no-cache, must-revalidate, max-age=0`
  - `Cross-Origin-Resource-Policy: same-site` (or dedicated download origin `dl.<domain>` in production so no script/cookie context shares the app origin)
- **One-time token:** Downloading immediately consumes the job token and unlinks `output.bin`; expired or unknown `job_id` returns `404` identically (no enumeration oracle).

---

## 5. Comprehensive Threat Model Matrix

| # | Threat Scenario | Attack Vector | Impact | Mitigations | Verification / Test |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | **Malicious Image Files** | Crafted TIFF IFD pointer cycles (infinite loop), huge EXIF tag counts, JPEG polyglots, ExifTool/libjpeg bugs | Browser worker hang/OOM, backend parser crash/RCE | Visited-offset `Set` for IFD loops, max tag count (`4096`), bounded slices, non-root `--network=none` ExifTool subprocess with timeout | Malformed IFD-loop & truncated JPEG/PNG fixtures |
| **2** | **Malicious PDFs** | `/JavaScript`, `/OpenAction`, `/Launch`, `/URI` SSRF, deeply nested object streams, `qpdf` parser flaws | Client script exec if rendered inline, backend DoS/RCE | Never render PDFs inline on app origin without sandbox; extract via bounded `pdfjs-dist` (`disableAutoFetch`, no script eval) & sandboxed `pikepdf` with timeout | PDF fixtures with JS, `/Launch`, and malformed xref tables |
| **3** | **Malformed Office Packages** | OOXML ZIP with XXE in `docProps/core.xml`, external relationships (`TargetMode="External"`), huge XML | Backend XXE file read, SSRF, XML billion-laughs OOM | `defusedxml` / `processEntities: false`, reject DTDs, ignore external targets, cap XML entry read to `16 MB` | XXE & billion-laughs `.docx` test fixtures |
| **4** | **ZIP / Decompression Bombs** | `42.zip` recursive/high-ratio DEFLATE payloads inflating KB -> GB | Memory exhaustion / disk fill | Inspect central directory before inflating; enforce ratio (`<=100:1`), max entry size, streaming byte counter, `RLIMIT_FSIZE` | Synthetic high-ratio ZIP bomb fixture |
| **5** | **Parser Vulnerabilities** | Memory corruption (heap overflow, UAF) in `libmagic`, `FFprobe`, `qpdf`, `ExifTool` | Arbitrary code execution in worker | Non-root container, read-only rootfs, `--cap-drop=ALL`, seccomp, `--network=none`, per-job fresh subprocess | Fuzzing / malformed fixture crash isolation tests |
| **6** | **Memory Exhaustion** | 5 GB file read into `ArrayBuffer`, or huge `MetadataField[]` / event log array | Browser tab crash / backend OOM kill | `Blob.slice()` max `16 MB`, `hash-wasm` streaming, 5,000-event ring buffer, `RLIMIT_AS` on backend | 5 GB sparse fixture benchmark in Chrome/Firefox/Safari |
| **7** | **Denial of Service (DoS)** | Slowloris upload, ReDoS in search/tag parsing, flood of `/analyze` requests | Service unavailability for other users | Reverse-proxy read timeouts, linear string/index matching (no catastrophic regex), IP rate limiting, worker semaphore | Concurrent stress + slow-upload timeout tests |
| **8** | **Path Traversal** | Archive entries `../../etc/shadow`, filename `../a.jpg`, malicious `job_id` | Arbitrary file read/write | Server UUIDv4 filenames (`input.bin`), UUIDv4 validation on `job_id`, archive entries never written to disk, filename sanitization | Path traversal test cases on archive & download APIs |
| **9** | **SSRF via Parser / External Resources** | SVG `<image xlink:href="http://169.254.169.254/">`, XML `SYSTEM` URLs, HLS `.m3u8` inside `.mp4`/`.mov` | Internal cloud metadata / LAN probing | Worker containers run with `--network=none`; disable XML external entities; disable `FFprobe` network protocols (`-protocol_whitelist file,pipe`) | Verify container has zero egress & FFprobe rejects `http://` |
| **10** | **XSS via Extracted Metadata** | `<img src=x onerror=alert(1)>` in EXIF `Artist` or PDF `Author`; `=CMD(...)` in CSV export | Session hijacking, arbitrary JS execution, Excel macro injection | React text rendering only (no raw HTML injection), strict CSP, neutralize CSV cells starting with `=`, `+`, `-`, `@`, `\t`, `\r` by prefixing `'` | XSS payload metadata fixture + CSV formula test |
| **11** | **Data Leakage** | Stack traces, verbose server logs printing metadata/filenames, browser `localStorage` persistence | Exposure of user PII (GPS, author names) | Generic client error codes, sanitized structured logging (no filenames/metadata/bytes), volatile memory only (`Zustand`), `Cache-Control: no-store` | Log inspection & storage inspection after analysis |
| **12** | **Temporary Storage Exposure** | Crash/SIGKILL leaves `/tmp/trace-jobs/<uuid>` behind; world-readable temp permissions | Cross-job or host file exposure | `0700` dir / `0600` file permissions, `try/finally` cleanup, 60s background TTL sweeper, `tmpfs` where practical | Simulated worker crash + verify TTL cleanup |
| **13** | **Hash & Report Tampering** | Modifying JSON/PDF report post-export or spoofing sanitization status | Integrity misrepresentation | Include `reportSchemaVersion`, `analysisTimestamp`, `toolVersions`, `coverage`, and `inputSha256` inside reports; verify sanitization strictly by re-parsing output bytes | Independent CLI verification (`exiftool`/`sha256sum`) |
