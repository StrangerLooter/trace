# TRACE — System & Product Requirements

**Product:** TRACE — Universal File Intelligence & Digital Forensics Platform  
**Phase:** 1 — Requirements Specification  
**Priority Legend:** `P0` Essential MVP | `P1` Important | `P2` Advanced | `P3` Future Research

---

## 1. Functional Requirements

### 1.1 Module A — Universal File Identification

| ID | Priority | Requirement | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| **FR-A01** | P0 | Drag-and-drop, file picker, and multi-file queue ingestion, including files without extensions or with unknown extensions. | Dropping 1..N files (including extensionless `blob` files) enqueues all items without blocking UI; each item receives a client-side UUID. |
| **FR-A02** | P0 | Binary magic-number detection independent of filename extension and browser `File.type` MIME. | Renamed `.png` -> `.jpg` or `.exe` -> `.pdf` is identified by actual binary header bytes, not extension or browser MIME. |
| **FR-A03** | P0 | Extension & MIME mismatch detection. | When extension implies format X and signature proves format Y, system records a mismatch flag with declared vs. detected types. |
| **FR-A04** | P0 | Multi-offset, variable-length, and container-aware signature matching (e.g., `RIFF`->`WEBP`/`WAVE`, `ftyp` at offset `4`, `MZ`->`e_lfanew`->`PE\0\0`, `ZIP`->OpenXML package). | Unit tests verify all P0 signatures, short/empty inputs (`0..16` bytes), and ambiguous containers without out-of-bounds crashes. |
| **FR-A05** | P0 | Identification confidence levels (`Confirmed`, `Probable`, `Ambiguous`, `Unknown`) and Format Support Registry status display. | Every file displays its confidence level, matching evidence bytes, and exact support status (`Fully supported`, `Partially supported`, `Identification only`, `Experimental`, `Unsupported`). |
| **FR-A06** | P0 | File properties and streaming cryptographic hashes (SHA-256 in P0; MD5/SHA-1 optional in P1). | File size, byte count, and streaming SHA-256 match standard CLI `sha256sum` output for small and multi-GB files. |

### 1.2 Module B — Deep Metadata Extraction

| ID | Priority | Requirement | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| **FR-B01** | P0 | Normalized metadata field schema: `fieldName`, `value`, `dataType`, `group`, `sourceParser`, `byteRange` (optional `{ start, length }`), `confidence`, `isSensitive`, `status` (`valid`/`missing`/`malformed`/`suspicious`). | Every extracted field conforms to the TypeScript/JSON schema; `byteRange` is `null`/`undefined` whenever a parser cannot prove exact byte coordinates. |
| **FR-B02** | P0 | P0 parsers: **JPEG** (SOF/APPn/EXIF/IPTC/XMP/COM), **PNG** (IHDR/tEXt/iTXt/zTXt/eXIf/pHYs/IEND), **PDF** (header/trailer/Info/XMP/page count/encryption/JS/embedded indicators), **MP4** (`ftyp`/`moov`/`mvhd`/`tkhd`/`udta`/`meta`). | Valid, metadata-rich, metadata-free, and truncated fixtures for all 4 formats parse cleanly and match golden test expectations. |
| **FR-B03** | P1 | P1 parsers: **WebP**, **TIFF**, **MP3** (ID3v1/v2), **WAV**, **FLAC**, **OGG**, **MOV/MKV/WebM**, **Office OpenXML** (`DOCX`, `XLSX`, `PPTX` core/app/custom properties, comments/revisions), and deep PDF (annotations, forms, signatures, embedded files). | Each parser outputs normalized fields into grouped sections (`General`, `EXIF`, `GPS`, `Audio`, `Video`, `PDF`, `Office`, etc.). |
| **FR-B04** | P2 | P2 parsers: **Windows PE**, **Linux ELF**, **macOS Mach-O** (headers, arch, entry point, sections, imports/exports, timestamps, overlay, certs), **Camera RAW MakerNotes**, **RAR/7Z/TAR/GZIP**. | Executed in isolated backend workers (or WASM/TS where safe) with structured section and import output. |

### 1.3 Module C — Digital Forensics & Security Intelligence

| ID | Priority | Requirement | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| **FR-C01** | P0 | Deterministic privacy & integrity rule engine producing explainable findings (`title`, `severity`, `explanation`, `evidence`, `affectedField`, `whyItMatters`, `suggestedAction`, `detectionMethod`, `confidence`). | Findings cover `Informational`, `Low`, `Medium`, `High`, `Critical`; no arbitrary AI risk scores exist. |
| **FR-C02** | P0 | Format-specific structural checks: extension mismatch, truncation, malformed headers, and unexpected trailing bytes past format-specific boundaries (e.g., after JPEG `FF D9` EOI or PNG `IEND`). | Appended bytes after `IEND`/`FF D9` are reported as structural anomalies requiring review—never automatically labeled "steganography" or "confirmed malware". |
| **FR-C03** | P1 | Privacy classification for GPS coordinates, device serials, camera IDs, author/usernames, emails, software strings, personal timestamps, edit history, embedded thumbnails, and embedded documents. | Sensitive fields are visibly badged in Metadata Explorer and linked to actionable Privacy Findings. |
| **FR-C04** | P1 | Archive & container integrity checks: suspicious ZIP entry paths (`../`), symlink flags, high compression ratio (bomb indicators), overlapping/mismatched declared sizes. | Crafted traversal/bomb test fixtures trigger findings safely without extracting payloads to disk or exhausting RAM. |

### 1.4 Module D — Metadata Sanitizer

| ID | Priority | Requirement | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| **FR-D01** | P1 | Inspectable sanitization preview: select individual supported metadata categories or all supported sensitive categories, showing exact warnings before cleaning. | Users see which segments/fields will be removed and any side effects (e.g., signature invalidation, structural rewrite). |
| **FR-D02** | P1 | Format-specific sanitizers (JPEG segment stripper, PNG chunk stripper, consented backend `pikepdf` PDF Info/XMP cleaner) — never a fake universal cleaner. | Original file is never modified; cleaned copy downloads with safe filename (`<name>.clean.<ext>`). |
| **FR-D03** | P1 | Post-sanitization re-inspection & honest status reporting (`Successfully removed and verified`, `Removal attempted, verification incomplete`, `Unsupported metadata`, `Sanitization failed`, `File integrity changed`, `Original preserved`). | Sanitizer automatically re-parses the output bytes and generates a before/after diff report verifying targeted fields are absent. |
| **FR-D04** | P2 | Extended sanitization for WebP, TIFF, MP3/FLAC, MP4/MOV (`ffmpeg -map_metadata -1 -c copy`), and Office OpenXML properties. | Unsupported formats clearly refuse sanitization instead of silently claiming success. |

### 1.5 Module E — Hex & Binary Inspector

| ID | Priority | Requirement | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| **FR-E01** | P0 | Virtualized range-based hex viewer displaying byte offsets (`0x00000000`), hex bytes, ASCII column, cursor offset, selected range, and file size. | Opens a 5 GB file and scrolls smoothly using `Blob.slice()` paging without loading whole file into RAM. |
| **FR-E02** | P0 | Data Inspector panel decoding selected bytes (`uint8`, `int8`, `uint16/32/64` LE/BE, `float32/64`, ASCII/UTF-8, binary bits). | Selecting 1–8 bytes updates all interpretations deterministically. |
| **FR-E03** | P0 | Navigation: jump to hex/decimal offset, click-to-jump from metadata fields / RE Mode events with valid `byteRange`, and highlight detected structure ranges. | Clicking a field with an exact offset scrolls to and highlights `[start, start+length)`; fields without exact offsets show an explicit *"Exact byte offset unavailable"* indicator. |
| **FR-E04** | P1 | Hex sequence search and ASCII string search across bounded file windows (cancellable on large files). | Searches stream chunks with progress and cancellation support. |

### 1.6 Module F — Reporting & Exports

| ID | Priority | Requirement | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| **FR-F01** | P0 | Versioned JSON report export containing identification, properties, hashes, coverage flags, metadata groups, findings, parser versions, timestamps, and unsupported warnings. | Exported JSON validates against a documented JSON Schema (`report-schema` v1.0). |
| **FR-F02** | P1 | CSV export (flattened metadata & findings) and formatted PDF forensic summary report. | CSV properly escapes formula-injection prefixes (`=`, `+`, `-`, `@`); PDF renders cleanly offline/client-side or via safe generator. |

### 1.7 Signature Feature — `RE Mode` (Reverse Engineering Mode)

| ID | Priority | Requirement | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| **FR-R01** | P0 | Instant toggle between `Analysis Mode` (default) and `RE Mode` within the same live analysis session without re-running or duplicating the engine. | Toggling preserves loaded file, parsed state, and event history instantaneously. |
| **FR-R02** | P0 | Typed live event stream (`FILE_RECEIVED`, `HEADER_READ`, `SIGNATURE_MATCHED`, `SIGNATURE_MISMATCH`, `PARSER_SELECTED`, `STRUCTURE_DETECTED`, `METADATA_FIELD_FOUND`, `ANOMALY_DETECTED`, `ANALYSIS_COMPLETED`, etc.) emitted by actual worker operations. | Every log line corresponds 1:1 to a real worker message; zero fabricated progress or fake shell output. |
| **FR-R03** | P0 | Interactive RE panels: event stream, filter by severity/parser, search events, pause/resume display (without dropping underlying history), copy/export log, structure explorer tree, and click-to-jump byte offset. | Terminal panel never accepts or executes arbitrary shell commands. |

### 1.8 Large-File & Consent Engineering

| ID | Priority | Requirement | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| **FR-L01** | P0 | Range-based reading (`Blob.slice()`), streaming hashing (`hash-wasm`), Web Worker isolation, cancellation, and worker termination. | Cancelling a 5 GB hash terminates/aborts within < 500 ms and frees worker buffers. |
| **FR-L02** | P0 | Explicit analysis coverage indicator (`Header inspected`, `Footer inspected`, `Container index inspected`, `Complete scan`, `Partial scan`). | Multi-GB partial scans explicitly warn which structures were not inspected. |
| **FR-L03** | P1 | Explicit user consent dialog before any optional backend upload for deep parsing/sanitization, displaying data lifecycle & retention guarantees. | Zero bytes leave the browser unless the user clicks explicit consent. |

### 1.9 Essential Website Architecture & Content Requirements

| ID | Priority | Requirement | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| **FR-W01** | P0 | **Landing Page (`/`):** Minimal top nav (`<= 5` links + primary CTA), serene hero inspired by reference aesthetics, inline Dropzone / `Inspect a File` CTA, structured capabilities, How It Works, interactive `Analysis Mode` vs `RE Mode` preview, format summary, privacy pledge, sanitization overview, FAQ, and structured Footer. | Passes above-the-fold clarity check; zero marketing fluff or neon/gradient clutter. |
| **FR-W02** | P0 | **Workspace (`/workspace`):** Collapsible sidebar (File Queue, Active File, Mode Toggle, Section tabs: Overview, Metadata, Forensics, Hex Inspector, Sanitizer, Export) adapting to drawer/bottom-sheet on mobile. | Supports multi-file switching and preserves state across views. |
| **FR-W03** | P0 | **Format Matrix (`/formats`), Privacy (`/privacy`), Security (`/security`), Terms & Disclaimer (`/terms`), Open-Source Licenses (`/licenses`), About/Contact (`/contact`).** | All legal, policy, contact, and open-source attribution links resolve from Footer and Navigation cleanly. |
| **FR-W04** | P1 | **Guides / Blog (`/guides`), Changelog (`/changelog`), and Feedback / Format Request Form (`/contact`).** | Includes clean MDX/structured articles, search/category tags, copyable technical snippets, and minimal non-intrusive contact/request form. |

---

## 2. Non-Functional Requirements

### 2.1 Performance Budgets
- **Landing Page Initial Load:** `< 120 KB` gzipped initial JS bundle; LCP `< 1.8s` on simulated 4G.
- **Code Splitting:** Heavy parsers (`mediainfo.js` WASM, `pdfjs-dist`), Hex Inspector, and Sanitizer lazy-loaded only when entering Workspace or encountering matching file signatures.
- **Worker Memory Ceiling:** Peak Web Worker heap + buffer allocation `< 150 MB` even on a 5 GB file.
- **UI Responsiveness:** Main thread frame time `< 16 ms` during hashing and virtualized hex scrolling (`60 fps` scroll on desktop).

### 2.2 Security & Privacy Requirements
- **Zero unconsented uploads:** Client-side engine operates offline-capable with no external telemetry on file contents or metadata values.
- **XSS prevention:** All extracted metadata strings rendered strictly as text; CSV cells sanitized against formula injection; untrusted SVG/PDF/HTML never served inline from app origin.
- **Backend isolation (when consented):** Non-root container, read-only rootfs, `--network=none`, strict CPU/RAM `ulimit`, server-generated UUIDv4 filenames, `shell=False` subprocess execution, hard parser timeouts, automatic `try/finally` + sweeper cleanup, safe `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff` download headers.

### 2.3 Accessibility & Responsive Targets
- **Accessibility:** Target **WCAG 2.2 AA** — full keyboard navigation, visible focus rings, ARIA landmarks/roles on tabs/trees/modals, screen-reader live regions for analysis completion, and `prefers-reduced-motion` support.
- **Viewport Coverage:** Tested across `320px` (small phone), `390px` (standard phone), `768px` (tablet), `1280px` (laptop), `1440px` (desktop), `2560px` (ultrawide), and `3840px` (4K TV) with `max-width` prose/card constraints and zero horizontal page overflow.
