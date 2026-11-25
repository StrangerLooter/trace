# TRACE — Product Vision

**Product Name:** TRACE  
**Category:** Universal File Intelligence & Digital Forensics Workspace  
**Tagline:** *"Look Beyond the File."*  
**Alternative Tagline:** *"Every File Has a Story."*  
**Phase:** 1 — Product Vision & Scope

---

## 1. Purpose & Core Philosophy

Every file contains far more information than its visible surface:
- A photograph can embed GPS coordinates, camera/lens serial numbers, timestamps, software fingerprints, and hidden preview thumbnails.
- A PDF can retain author metadata, producer/creator toolchains, incremental edit history, embedded files, annotations, form fields, JavaScript actions, and digital signatures.
- A video container encodes nested boxes/atoms, multi-stream codecs, encoder signatures, chapters, rotation flags, and stream-level metadata.
- An Office archive or executable carries usernames, revision counts, internal XML relationships, section headers, imported libraries, debug paths, and structural overlays.

**TRACE** bridges the gap between opaque online metadata viewers and fragmented forensic CLIs. It gives users a single, calm, high-craft workspace that runs **locally in the browser by default**, surfaces human-understandable privacy and integrity findings (`Analysis Mode`), exposes authentic low-level parser telemetry and byte-offset navigation (`RE Mode`), and provides verifiable format-specific metadata sanitization.

### Explicit Positioning Boundary
TRACE is an **investigative, privacy, and digital forensics intelligence platform** for ordinary users, developers, security researchers, students, and forensics enthusiasts. It is **not** marketed as a court-certified forensic acquisition suite unless formal external validation and chain-of-custody standards are separately implemented and certified.

---

## 2. Target Users & Needs

| Persona | Primary Goal | Core Modules Used |
| :--- | :--- | :--- |
| **Privacy-Conscious Everyday User** | Check if photos/PDFs leak location, device IDs, or author names before sharing; strip sensitive metadata safely. | Upload, File Overview, Privacy Findings, Metadata Sanitizer |
| **Software / Security Engineer** | Verify true file types via magic numbers, inspect PDF/Office/container anomalies, debug binary headers, and export structured JSON reports. | Signature Engine, Metadata Explorer, Hex Inspector, JSON Export |
| **Digital Forensics Student / Researcher** | Understand internal file structures, watch real parser steps execute live, jump from extracted tags to exact byte ranges, and inspect malformed/renamed fixtures. | **RE Mode**, Hex Inspector, Forensic Findings |
| **Security Analyst / Incident Triage** | Triage suspicious renamed files, ZIP anomalies, PE/ELF headers, unexpected trailing bytes, and export audit-ready reports without risking auto-execution. | Identification, Forensics, RE Mode, PDF/JSON Reports |

---

## 3. Product Scope

### In Scope (Phased P0–P3)
1. **Universal File Identification (Module A):** Magic-number signature engine, extension/MIME mismatch detection, confidence & evidence reporting, streaming hashes, and an honest Format Support Registry.
2. **Deep Metadata Extraction (Module B):** Normalized metadata schema with field name, value, type, group, source parser, exact byte offset/length (never fabricated), confidence, and sensitivity/malformed flags.
3. **Digital Forensics & Security Intelligence (Module C):** Deterministic, explainable privacy findings and format-specific structural integrity checks with `Informational` -> `Critical` severity ratings.
4. **Metadata Sanitizer (Module D):** Format-specific selective removal with preview, original preservation, before/after comparison, and post-clean verification statuses.
5. **Hex & Binary Inspector (Module E):** Range-read, virtualized hex/ASCII/data inspector with byte search, structure highlighting, and metadata-to-offset jump links.
6. **Reporting & Exports (Module F):** Stable versioned JSON schema, CSV tables, and formatted PDF reports.
7. **Reverse Engineering Mode (`RE Mode`):** Live session-preserving toggle displaying authentic Web Worker / parser event streams, structural tree, and offset telemetry.
8. **Large-File Engineering:** Safe 5 GB+ handling via `Blob.slice()`, bounded buffers, streaming SHA-256, explicit coverage flags, cancellation, and explicit-consent backend escalation.
9. **Complete Web Platform Experience:** Minimal, serene landing page, structured capabilities & format pages, guides/blog, changelog, privacy/security documentation, low-friction feedback/contact forms, and legal/policy pages.

### Explicitly Out of Scope
- Court-certified forensic disk imaging or chain-of-custody hardware write-blocking.
- Arbitrary user-editable shell execution in `RE Mode` (read-only inspection terminal only).
- AI-fabricated risk scores or unverified heuristic "malware verdict" claims.
- Automatic background uploading of files or silent server persistence.
- Claiming universal metadata sanitization or 100% file cleanliness without format-specific proof.

---

## 4. Prioritized Feature Roadmap (P0–P3)

| Priority | Scope | Features Included |
| :--- | :--- | :--- |
| **P0 (MVP Release)** | Core platform, local-first inspection & showcase | Minimal responsive Landing Page & essential site pages (Privacy, Security, Terms, Licenses, Formats, Contact/About); Multi-file drag-and-drop Workspace; True magic-number signature detection & extension mismatch; Basic properties & streaming SHA-256 (`hash-wasm`); Parsers for JPEG (EXIF/IPTC/XMP/basic), PNG (chunks/tEXt/iTXt/zTXt), PDF (basic Info/XMP/page count/encryption/JS indicators), MP4 (ftyp/moov/basic boxes); `Analysis Mode` & `RE Mode` live event stream; Virtualized range-based Hex Inspector with offset linking; Versioned JSON export; Privacy-first local execution. |
| **P1 (Important)** | Expanded metadata, forensics & verifiable cleaning | EXIF GPS coordinates & privacy severity findings; Advanced PDF structural inspection (embedded files, annotations, forms, signatures); Audio metadata (MP3 ID3, WAV RIFF, FLAC, OGG); Extended Video metadata (MOV, MKV, WebM via `mediainfo.js`); Office OpenXML (`DOCX`/`XLSX`/`PPTX` core/app/custom XML); Forensic anomaly rules (trailing bytes, ZIP anomalies, truncation); CSV & PDF report exports; Format-specific Metadata Sanitizer (JPEG, PNG, PDF Info/XMP via consented backend `pikepdf`) with before/after verification; Technical Guides/Blog & Changelog pages. |
| **P2 (Advanced)** | Binary executables, RAW & large-file escalation | Camera RAW MakerNotes (via consented backend `ExifTool`); Windows PE & Linux ELF & Mach-O header/section/import/overlay inspection; Extended archives (`RAR`, `7Z`, `TAR`, `GZIP`); Consented backend large-file `FFprobe` & `qpdf` structural processing; Extended forensic rules & sanitization for MP4/Audio/Office. |
| **P3 (Future)** | Ecosystem & extensibility | Rare formats (databases, fonts, disk image headers, firmware containers); Declarative `.ksy`/plugin parser extensibility; Optional authenticated report history (explicit opt-in); Collaborative/team workspace exports. |

---

## 5. Core User Journeys

### Journey 1: Everyday Privacy Check & Sanitization (Local-First)
1. User drops a smartphone JPEG onto the hero dropzone or Workspace.
2. TRACE inspects the file locally in a Web Worker: verifies `FF D8 FF` JPEG signature, computes SHA-256, extracts EXIF/GPS/camera serial/thumbnail.
3. `Analysis Mode` highlights a **High** privacy finding (`GPS Coordinates Present`) and **Medium** (`Device Serial / Camera Model`).
4. User clicks `Sanitize`, selects GPS + Camera + Thumbnail categories, previews removal warnings, and clicks `Clean & Download`.
5. TRACE strips targeted APP1/EXIF/XMP/COM segments losslessly, re-inspects the output buffer, verifies removal (`Successfully removed and verified`), and downloads `<name>.clean.jpg` while preserving the original.

### Journey 2: Large 5 GB Video Triage (Bounded Memory & Consent)
1. User selects a 5 GB `.mp4` file in the Workspace.
2. TRACE never loads the file into one `ArrayBuffer`. A Web Worker reads bounded slices (`ftyp` header, box headers via range seeks, trailing `moov` if at EOF) and displays exact coverage (`Header inspected`, `Container index inspected`, `Full stream hash: optional/cancellable`).
3. User runs streaming SHA-256 if desired (or cancels mid-way cleanly).
4. If deep codec/stream inspection or `FFprobe` extraction is needed, TRACE displays an explicit consent prompt explaining what will be uploaded, how temporary storage works, and when it is deleted.

### Journey 3: Suspicious Renamed File Investigation (`RE Mode`)
1. User drops `invoice_2026.pdf` which is actually a Windows `PE` (`MZ...PE\0\0`) or renamed `ZIP`.
2. Signature engine raises a **High** `SIGNATURE_MISMATCH` finding immediately (declared `.pdf`, binary signature `PE32+ executable`).
3. User switches to `RE Mode`, reviews the timestamped parser trace (`HEADER_READ offset=0x00000000`, `SIGNATURE_MISMATCH`), clicks the `PE` signature event, and jumps directly to `0x00000000` / `e_lfanew` offset in the Hex Inspector.
4. User exports a versioned JSON/PDF forensic report.

---

## 6. Success Metrics & Quality Gates

- **Privacy Integrity:** `0` unconsented file-byte network requests during local analysis (verifiable via browser Network DevTools).
- **Large-File Stability:** 5 GB sparse/synthetic MP4 opens, identifies signature, walks top-level boxes, and navigates hex offsets with peak browser worker RAM <= 150 MB and zero UI freeze.
- **Offset Honesty:** `0` fabricated byte offsets; 100% of highlighted hex ranges trace to real parser byte coordinates.
- **Accessibility & Responsiveness:** Passes WCAG 2.2 AA automated/manual checks and renders cleanly from `320px` mobile to `3840px` 4K/TV viewports with zero horizontal page overflow.
