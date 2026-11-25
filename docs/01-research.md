# TRACE — Phase 0: Research & Product Discovery

**Product:** TRACE — Universal File Intelligence & Digital Forensics Platform  
**Tagline:** *"Look Beyond the File."* (Alternative: *"Every File Has a Story."*)  
**Phase:** 0 — Research & Product Discovery  
**Status:** Complete — Ready for Review

---

## 1. Problem Space & Product Opportunity

Modern files carry far more information than what users see in an image viewer, media player, or document reader:
- **Photographs** embed EXIF/XMP/IPTC tags, GPS coordinates, camera serial numbers, lens data, software versions, timestamps, and embedded preview thumbnails.
- **PDFs** carry document info dictionaries, XMP streams, incremental update history, embedded files, form fields, annotations, JavaScript actions, and digital signatures.
- **Media containers (MP4/MOV/MKV/MP3)** encode nested boxes/atoms, multi-stream codec parameters, encoder strings, chapters, and creation timestamps.
- **Archives & Office packages (ZIP/DOCX/XLSX/PPTX)** wrap XML property files, author/revision metadata, comments, tracked changes, and nested entries vulnerable to structural abuse.
- **Executables (PE/ELF/Mach-O)** expose target architecture, section layouts, import/export tables, compiler/linker artifacts, debug paths, timestamps, overlays, and code-signing structures.

### Gaps in Existing Solutions
1. **Fragmented CLI ecosystem:** Investigators juggle `file`, `exiftool`, `mediainfo`, `ffprobe`, `qpdf`, `pefile`, and `xxd` separately, with inconsistent schemas and zero cross-linking between parsed fields and raw byte offsets.
2. **Unsafe online "metadata viewers":** Most web-based metadata tools silently upload user files to unknown servers, store or log content, hide how parsing works, and offer no verifiable sanitization or large-file safety.
3. **Opaque desktop/GUI sanitizers:** Many "cleaners" claim 100% removal after deleting a few top-level tags while leaving XMP streams, PDF incremental objects, or embedded thumbnails intact.
4. **No unified bridge between human-readable intelligence and reverse engineering:** Ordinary users need plain-language privacy findings; developers and analysts need raw hex offsets, real parser execution logs, and structural boundaries.

**TRACE Differentiation:**
- **Local-First by Default:** Signature detection, streaming SHA-256, virtualized hex inspection, and primary parsers run inside browser Web Workers without uploading file bytes.
- **Explicit Consent for Server Escalation:** Heavy/deep formats (e.g., complex MakerNotes, deep FFprobe streams, qpdf structural PDF cleaning) escalate to an isolated backend only after explicit user approval.
- **Dual-Lens Session (`Analysis Mode` <-> `RE Mode`):** A single real execution engine powering both an accessible forensic report and an authentic, evidence-driven reverse-engineering event stream.
- **Byte-Offset Traceability:** Clicking a metadata field jumps to its exact byte range in a virtualized Hex Inspector—never fabricated when a parser cannot prove an offset.
- **Verifiable Format-Specific Sanitization:** Before/after re-inspection and honest status reporting instead of false "100% clean" claims.

---

## 2. Existing Products & Competitive Landscape

| Product | Category | Core Capabilities | Strengths | Limitations | License |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **ExifTool** | Metadata reader/writer (Perl) | Reads/writes EXIF, IPTC, XMP, MakerNotes across 100s of formats | Industry gold standard for tag breadth and camera MakerNotes | Perl CLI; not native in browser; **cannot reliably scrub deep PDF object history** without flattening | Artistic License 1.0 or GPL-1.0-or-later |
| **MediaInfo** | Media container analyzer | Deep technical & tag inspection for MP4, MKV, MOV, AVI, MP3, FLAC | Accurate codec, stream, bitrate, and container reporting; WASM port (`mediainfo.js`) exists | Read-only (no sanitization); does not expose general binary hex/forensic rules | Simplified BSD (BSD-2-Clause) |
| **Apache Tika** | Content & metadata extraction (Java) | Identifies and extracts text/metadata from 1,000+ document/archive formats | Broad enterprise document coverage | Heavy JVM footprint; unsuitable for browser execution; limited binary/hex forensics | Apache-2.0 |
| **TrID** | Signature identifier | Probability-scored file type matching via XML signature database | Probabilistic matching for ambiguous/headerless variants | **Proprietary/freeware license** (commercial use requires registration); no semantic metadata parsing | Freeware (Non-commercial) / Proprietary |
| **`file` / `libmagic`** | Magic-number identifier (C) | Classic Unix signature + MIME classification via compiled magic rules | Fast, battle-tested, universal baseline | Weak on nested ZIP containers without deeper inspection; legacy magic rule syntax | BSD-2-Clause (standard `file`/libmagic) |
| **DROID** | Archival format ID (Java) | Batch PRONOM-based signature & container identification | Authoritative archival PUIDs | Heavy Java desktop/CLI; archival focus rather than privacy/forensics/sanitization | BSD-3-Clause |
| **Siegfried** | Signature ID engine (Go) | Fast PRONOM + Freedesktop + Wikidata signature matching | Very fast, clean Go binary, Apache-2.0 | Identification only — no deep metadata extraction, hex viewer, or sanitizer | Apache-2.0 |
| **Autopsy** | Full DFIR suite (Java) | Disk images (E01/DD), timeline analysis, carving, registry, hash sets | Comprehensive disk forensics workflow | Heavy desktop suite; high RAM/storage overhead; not a quick web inspection workspace | Apache-2.0 (core) |
| **ImHex** | Reverse-engineering hex editor (C++) | Pattern Language, colored hex regions, Data Inspector, disassembler, entropy | Best-in-class visual model for linking byte offsets to parsed structures | Desktop C++ app (GPLv2); high GUI overhead; no privacy sanitizer or consumer UX | **GPL-2.0** |
| **CyberChef** | Web data transformer | 500+ browser recipes (decode, hash, entropy, basic parsers) | Runs 100% client-side; zero server upload | Pipeline/recipe UX is intimidating for ordinary users; lacks unified forensic report & sanitization | Apache-2.0 |
| **ExifCleaner** | GUI metadata stripper (Electron) | Drag-and-drop wrapper around ExifTool | Simple consumer UX | **Leaves raw PDF object metadata/annotations behind**; Electron bundle overhead | MIT |
| **MAT2** | Metadata anonymizer (Python) | Structural cleaning across images, audio, video, PDFs, Office | Strong privacy focus; re-encodes/rebuilds rather than naive tag deletion | Linux/CLI-centric; aggressive re-encoding can alter content; **LGPL-3.0-or-later** | **LGPL-3.0-or-later** |
| **Dangerzone** | High-security doc sanitizer | Renders untrusted docs in sandboxed containers to raw pixels -> clean PDF | Neutralizes PDF/Office exploits, macros, and hidden objects | Always converts output to PDF (rasterized/OCR); **no video/audio support**; container startup latency | AGPL-3.0 (not suitable for direct proprietary embedding) |
| **Kaitai Struct** | Declarative binary parser | `.ksy` YAML specs compile to JS/TS/Python parsers with offset tracking | Ideal conceptual model for offset-aware binary structure parsing | Compiler (`kaitai-struct-compiler`) is **GPL-3.0+**; runtime libraries are MIT/Apache-2.0 | Compiler: GPL-3.0+ / Runtime: MIT |

---

## 3. Open-Source Libraries & Licensing Audit

### 3.1 Recommended Frontend / Browser / WebAssembly Stack (TypeScript)

| Library | Role in TRACE | License | Commercial & Distribution Notes |
| :--- | :--- | :--- | :--- |
| **`hash-wasm`** | Streaming SHA-256 / MD5 / SHA-1 / BLAKE3 in Web Worker | **MIT** | Permissive; supports incremental `init() -> update() -> digest()` over arbitrary chunks |
| **`exifr`** | Fast, selective JPEG/TIFF/PNG/HEIC/AVIF EXIF, GPS, XMP, IPTC, ICC extraction | **MIT** | Permissive; supports chunked/range reading (`exifr.parse(blob)`) |
| **`exifreader`** | Cross-validation & extended IPTC/XMP/MPF image parsing | **MPL-2.0** | Weak file-level copyleft; safe to use unmodified in commercial/open apps |
| **`mediainfo.js`** | WASM MediaInfoLib for MP4/MOV/MKV/AVI/WebM/MP3/FLAC/OGG | **MIT** (wrapper) / BSD-2-Clause (MediaInfoLib) | Permissive; supports chunked callback `readChunk(size, offset)` for multi-GB files |
| **`mp4box`** (`mp4box.js`) | Fine-grained ISO BMFF / MP4 atom & box hierarchy + byte offsets | **BSD-3-Clause** | Permissive; ideal for MP4 box tree explorer & offset navigation |
| **`music-metadata`** | Streaming ID3v1/v2, Vorbis, FLAC, RIFF/WAV, M4A tag extraction | **MIT** | Permissive; works with `Blob` / Web `ReadableStream` |
| **`pdfjs-dist`** | Client-side PDF metadata, page count, JS/form/annotation inspection | **Apache-2.0** | Permissive (retain NOTICE/copyright); supports range requests / chunked streams |
| **`pdf-lib`** | Client-side PDF Info dict modification / sanitization experiments | **MIT** | Permissive; useful for simple Info updates, though deep PDF scrubbing needs backend `qpdf`/`pikepdf` |
| **`fflate`** | Fast streaming ZIP / GZIP / DEFLATE inspection with decompression limits | **MIT** | Permissive; lightweight, supports ZIP central directory & entry metadata without full extraction |
| **`fast-xml-parser`** | Parsing XMP packets, SVG, Office OpenXML (`docProps/core.xml`, `app.xml`) | **MIT** | Permissive; **must disable external entity / DOCTYPE processing** to prevent XXE/entity expansion |
| **`kaitaistruct`** (runtime) | Executing hand-authored or pre-compiled `.ksy` binary structure parsers | **MIT** (runtime) | Note: keep GPL-3.0 `kaitai-struct-compiler` strictly as an offline dev/build tool if used, or write native TS binary readers |

> **Dual-license note (`jszip` vs `fflate`):** `jszip` is dual-licensed `MIT OR GPLv3`, whereas `fflate` is pure `MIT`, faster, smaller, and better suited for streaming/bounded decompression checks. **Decision: Prefer `fflate` over `jszip`.**

### 3.2 Recommended Backend Stack (Python / FastAPI — Isolated Container Workers)

| Library / Tool | Role in TRACE Backend | License | Boundary & Compliance Strategy |
| :--- | :--- | :--- | :--- |
| **`FastAPI`** + **`Pydantic`** | API server, schema validation, SSE progress streaming | **MIT** | Permissive |
| **`python-magic`** + `libmagic` | Secondary signature/MIME corroboration | **MIT** + **BSD-2-Clause** | Permissive; run only inside sandboxed worker with strict size/timeout limits |
| **`pikepdf`** (`libqpdf`) | Deep PDF inspection (objects, streams, JS, embedded files, linearization, Info/XMP removal) | **MPL-2.0** (`pikepdf`) + **Apache-2.0** (`qpdf`) | Weak file-level copyleft on `pikepdf`; safe without modifying library source |
| **`pypdf`** | Secondary PDF verification / cross-check | **BSD-3-Clause** | Permissive |
| **`pefile`** | Windows PE header, sections, imports, exports, overlay, authenticode offsets | **MIT** | Permissive |
| **`pyelftools`** | Linux ELF headers, sections, segments, symbols, dynamic deps | **Unlicense / Public Domain** | Permissive |
| **`macholib`** | macOS Mach-O headers, load commands, segments, dylibs | **MIT** | Permissive |
| **`lief`** | Unified cross-check for PE / ELF / Mach-O + certificate/signature details | **Apache-2.0** | Permissive |
| **`ExifTool`** (CLI subprocess) | Deep image/RAW MakerNotes & authoritative cross-check/sanitization | **Artistic-1.0 OR GPL-1.0+** | Run strictly as an **isolated subprocess** (never linked); document attribution & license terms |
| **`FFprobe` / `FFmpeg`** (CLI subprocess) | Deep container/stream/chapter inspection & video metadata copy-remux sanitization | **LGPL-2.1+** (use non-GPL build!) | Ensure container installs LGPL build without `--enable-gpl` components; run as isolated subprocess |

### 3.3 Libraries Explicitly Avoided (and Why)
- **`mutagen` (Python):** Licensed under **GPL-2.0-or-later**; linking it into Python backend services introduces strong copyleft obligations. Use `music-metadata` (MIT) client-side or `mediainfo`/`ffprobe` (LGPL/BSD) subprocesses on backend.
- **`TrID`:** Proprietary/non-commercial license restrictions conflict with open or commercial deployment.
- **`Dangerzone` (AGPL-3.0):** Strong network copyleft (AGPL-3.0) and rasterizes documents into PDFs, losing original formats.
- **`MAT2` (LGPL-3.0-or-later):** Opaque all-or-nothing cleaning makes granular field-level selection, exact verification status reporting, and selective preservation difficult. TRACE will implement transparent, format-specific sanitizers instead.

---

## 4. Browser Capabilities & Large-File (5 GB) Engineering Reality

### 4.1 What Browsers Can and Cannot Do Safely

| Operation | Browser Reality on 5 GB File | TRACE Design Implication |
| :--- | :--- | :--- |
| **`file.arrayBuffer()` / `FileReader.readAsArrayBuffer(file)`** | **Crashes tab (OOM).** V8/WebKit enforce ~2–4 GB typed-array/heap ceilings and Safari iOS kills tabs far earlier (~300 MB–1 GB). | **Prohibited** on whole files. All reads must use `file.slice(start, end)` bounded to small windows (64 KB–32 MB). |
| **`Blob.slice(start, end)`** | **O(1) pointer slice** on disk-backed `File` handle; allocates zero file bytes until `.arrayBuffer()` or `.stream()` is called on the slice. | Safe foundation for header, footer, box-walking, and virtualized hex paging. |
| **Passing `File` to Web Worker** | `postMessage({ file })` clones only the lightweight file descriptor, **not** file bytes. The worker reads slices directly off-thread. | Keep all I/O and parsing inside dedicated Web Workers. Use Transferable `[buffer]` only when passing small hex pages back to UI. |
| **`crypto.subtle.digest('SHA-256', ...)`** | **Non-streaming API** — requires the entire `ArrayBuffer` in RAM at once. Unusable above ~500 MB–1 GB. | Use **`hash-wasm` (`createSHA256()`)** with 16–32 MB `file.slice()` chunks inside a Web Worker; peak RAM stays flat (~32–64 MB). |
| **`SharedArrayBuffer` / WASM pthreads** | Blocked unless HTTP headers `COOP: same-origin` and `COEP: require-corp` are served; Safari memory reclamation under multi-threaded WASM is strict. | Design core workers to run on **single-threaded WASM + Transferables** without requiring COOP/COEP by default. |
| **Full video demuxing / MakerNotes / PDF structural rewrite** | Browser lacks `qpdf`, full `FFmpeg` (too large: ~30 MB WASM + high RAM), and ExifTool's Perl MakerNotes database. | Handle header/atom/basic metadata locally; offer **explicit opt-in backend escalation** for deep parsing or structural sanitization. |

### 4.2 Honest Analysis Coverage Model
For multi-gigabyte files in the browser, TRACE must never present a partial scan as a complete scan. Every analysis session tracks explicit coverage flags:
- `header_inspected` (e.g., first 64 KB)
- `footer_inspected` (e.g., last 64 KB, when applicable such as ZIP EOCD or trailing MP4 `moov`)
- `container_index_inspected` (e.g., MP4 box tree headers walked via range seeks, or ZIP central directory)
- `full_hash_computed` (streaming SHA-256 over 100% of bytes, user-cancellable)
- `deep_streams_inspected` (requires full sequential parse or consented backend FFprobe/ExifTool)

---

## 5. Security & Privacy Threat Landscape

Every uploaded or opened file must be treated as potentially hostile. Key threat vectors identified in Phase 0:
1. **Decompression / ZIP Bombs:** Small `.zip` / `.docx` / `.gz` expanding to gigabytes in memory. *Mitigation:* Inspect ZIP central directory headers first; enforce strict uncompressed-size ceilings, compression ratio thresholds, and streaming byte counters.
2. **XXE & Entity Expansion (Billion Laughs):** Malicious XML inside SVG, XMP packets, or Office `.xml` files. *Mitigation:* Disable DTDs, external entities, and network resolution in all XML parsers (`fast-xml-parser` / Python `defusedxml`).
3. **Cross-Site Scripting (XSS) via Extracted Metadata:** Attackers embed `<script>`, `javascript:`, or SVG event handlers inside EXIF `ImageDescription`, `Artist`, PDF `Author`, or ID3 tags. *Mitigation:* Treat all extracted strings as untrusted plain text; strictly escape in React/exports; never render untrusted SVG/HTML/PDF inline from the app origin.
4. **Parser Memory Corruption / DoS:** Native parsers (`libmagic`, `ExifTool`, `FFprobe`, `qpdf`) parsing malformed headers or recursive structures. *Mitigation:* Isolated non-root Docker worker, read-only rootfs, seccomp/no-new-privileges, `--network=none`, strict `ulimit` CPU/RAM ceilings, hard per-job timeouts, and process termination on timeout.
5. **Path Traversal & Symlink Attacks:** Archive entry names like `../../etc/passwd` or symlinks inside TAR/ZIP. *Mitigation:* Never extract archives to disk by default; inspect central directory metadata in-memory or normalize/reject unsafe paths strictly.
6. **Command Injection via Filenames:** Passing user filenames to `exiftool` or `ffprobe` via shell interpolation. *Mitigation:* Generate server-side UUIDv4 filenames; pass arguments exclusively as `argv` arrays (`subprocess.run([...], shell=False)`), never `shell=True`.
7. **Storage & Deletion Honesty:** Logical file deletion (`unlink()` / S3 `DeleteObject`) removes references immediately, but physical SSD wear-leveling or cloud storage snapshots prevent absolute guarantees of instant physical erasure. TRACE must delete temp artifacts deterministically (`try/finally` + sweeper daemon) and state storage semantics honestly in its Privacy Policy.

---

## 6. Reference Image Synthesis & Website Fundamentals Research

### 6.1 Analysis of Supplied Visual Reference Images

Seven visual references were provided to guide TRACE's aesthetic and structural direction:

1. **Image 1 (*Playful & Creative Fonts*):** Demonstrates high-craft typographic contrast and deliberate pairing between expressive display typography and clean, understated technical labels underneath. *Adaptation for TRACE:* Pair clean, authoritative display typography (Inter / Geist with tight display tracking) with crisp monospace technical labels (`JetBrains Mono` / `Geist Mono`) for hashes, offsets, and parser tags.
2. **Image 2 (*Railroad.ai*):** Ultra-clean, serene framed composition; floating pill top navigation (`How it works?`, `Pricing`, `Products`, `Blog`) with a single right-aligned pill CTA (`Get Started`); centered high-contrast headline, concise 2-line subtitle, and a single focal pill input bar. *Adaptation for TRACE:* Adopt this radical simplicity for the landing hero—replace the email waitlist bar with TRACE's primary file drop/picker entry bar (`Drop a file to inspect locally` + `Inspect a File` CTA).
3. **Image 3 (*Dispatch*):** Editorial clarity, ultra-sparse header (`LATEST ISSUE`, `ARCHIVE`, `ABOUT`, `MANIFESTO`, `GET STARTED`), micro-eyebrow label above the headline, tight focal input + button, and a single calming trust micro-caption directly underneath (*"Free forever. Unsubscribe anytime."* -> for TRACE: *"Local-first in your browser. Files never leave without consent."*).
4. **Image 4 (*Atlas — "Small Stories Vast Oceans"*):** Uses an **"Above vs. Beneath the Surface"** visual metaphor, pairing a calm editorial top layer with deep-water coordinates, depth scale (`0m` to `10,000m`), `ONLINE •` status indicator, and a concise `"BENEATH THE SURFACE"` caption. *Adaptation for TRACE:* This metaphor maps directly onto TRACE's tagline *"Look Beyond the File"* and its dual-mode concept (`Analysis Mode` on the surface <-> `RE Mode` + byte-offset depth ruler below).
5. **Image 5 (*UGH*):** Minimalist top-left logo + top-right menu, bold split headline with subtle italic/serif accent, concise two-line description, and a dark translucent pill action bar with high-contrast white button. *Adaptation for TRACE:* Clean dark-mode hero surface with restrained contrast and zero visual clutter.
6. **Image 6 (*BlacX Metadata Extractor* + Hex Workspace Collage):** Shows a structured dark sidebar workspace (`Dashboard`, `Metadata Extractor`, `Tasks`, `Help Center`, `Settings`), clean **Processing Level** selection cards (`Quick` vs. `Basic`), and a clean dashed drag-and-drop upload card paired alongside a dense binary inspector. *Adaptation for TRACE:* Clean workspace left navigation, explicit processing/coverage tier selector (e.g., *Local Quick Scan* vs. *Deep Consented Inspection*), and seamless transition from upload card to inspection workspace.
7. **Image 7 (*ImHex*):** Gold-standard reverse-engineering layout: synchronized 16-byte Hex column + ASCII column with color-coded structural regions, a right-hand **Data Inspector** (`uint8`..`uint64`, `float`, `ASCII`), and a bottom **Pattern Data** tree (`name`, `color`, `start`, `end`, `size`, `type`, `value`) + console log. *Adaptation for TRACE:* Direct blueprint for `RE MODE` and the `Hex Inspector`, stripped of cluttered desktop chrome and rendered in TRACE's restrained graphite/charcoal/terminal-green palette.

### 6.2 Essential Website Fundamentals (Architecture & Content Inventory)

To operate as a credible, complete, production-grade web platform rather than an isolated demo tool, TRACE requires standard website fundamentals alongside its analysis workspace:

1. **Brand Identity & Logo:** Clean SVG geometric wordmark + `TRACE` logotype, favicon/app icons, and consistent micro-copy (*"Look Beyond the File."*).
2. **Minimal Header Navigation:** Single-row sticky bar with <= 5 links: `Workspace`, `Supported Formats`, `Privacy & Security`, `Guides` (Blog), and primary CTA button `Inspect a File`.
3. **Homepage (Landing Page):**
   - Hero section with concise value statement, trust micro-copy, and immediate interactive Dropzone / `Inspect a File` CTA.
   - Structured Capabilities showcase (Identification, Deep Metadata, Forensic Findings, Verifiable Sanitization, Hex & RE Mode).
   - How It Works (3-step local-first -> consented escalation flow).
   - Interactive `Analysis Mode` vs. `RE Mode` preview switcher.
   - Supported Format Families & honesty statuses (`Fully Supported` vs. `Partial` vs. `ID Only`).
   - Privacy-First Architecture pledge + FAQ accordion.
4. **Workspace Shell & Sidebar:**
   - Persistent collapsible sidebar on desktop (bottom sheet / compact drawer on mobile): File Queue, Active File badge, Mode Switch (`Analysis Mode` / `RE Mode`), and section links (`Overview`, `Metadata`, `Forensics`, `Hex Inspector`, `Sanitizer`, `Export`).
5. **Forms (Low-Friction, Privacy-Safe):**
   - **File Upload / Analysis Form:** Drag-and-drop, multi-file picker, explicit consent modal before any optional backend upload, and local hash/scan options.
   - **Contact / Format Request / Issue Form:** Simple form (Topic, Email optional unless reply requested, Message) for requesting new parsers or reporting bugs—never gating analysis behind signup or email capture.
6. **Blog / Technical Guides & Changelog (`/guides`, `/changelog`):**
   - Educational forensic & privacy articles (*"Understanding EXIF & GPS Leakage"*, *"Why Naive PDF Metadata Removal Fails"*, *"Inspecting 5 GB Files in Browser Workers"*).
   - Transparent public Changelog documenting parser updates and security fixes.
7. **Structured Features & Format Matrix (`/formats`):**
   - Searchable, filterable registry showing exact browser vs. backend capabilities and support levels.
8. **Contact Details & Security Disclosure (`/contact`, `/security`):**
   - Dedicated security contact (`security@trace-forensics.example` placeholder until domain finalized), PGP key / responsible disclosure policy (`SECURITY.md`), and general support contact.
9. **Legal, Trust & Policy Links (Footer):**
   - **Privacy Policy** (explicitly detailing local-only default, zero tracking scripts, zero file-content analytics, and backend temp-file retention/deletion rules).
   - **Terms of Service & Forensic Disclaimer** (clarifying TRACE is an investigative/educational intelligence tool, not a court-certified forensic suite).
   - **Security Architecture & Threat Model Summary** (`/security`).
   - **Open-Source Licenses & Attributions** (`/licenses` — required for Apache-2.0, MIT, MPL-2.0, BSD compliance).
   - **System / Worker Status Indicator** (local worker health + optional backend API availability indicator).

---

## 7. Key Technical Decisions & Recommendations from Phase 0

1. **Monorepo Architecture:** `apps/web` (Next.js App Router + TypeScript + Tailwind CSS + Web Workers) + `apps/api` (FastAPI + Python isolated workers) + `packages/*` (`file-signatures`, `binary-core`, `parser-registry`, `shared-types`, `event-system`, `report-schema`) so signature detection and schemas are shared cleanly.
2. **Local-First Browser Engine:** Use `Blob.slice()`, Dedicated Web Workers, `hash-wasm`, `exifr`, `exifreader`, `mp4box`, `mediainfo.js`, `music-metadata`, `pdfjs-dist`, `fflate`, and `fast-xml-parser` (all permissive MIT/BSD/Apache-2.0/MPL-2.0 licenses).
3. **Permissive-First Backend Engine:** Python `FastAPI` + `pikepdf`/`qpdf` + `pefile` + `pyelftools` + `macholib` + `lief` + `python-magic`; isolate `ExifTool` and LGPL `FFprobe` behind strict non-root, no-network subprocess sandboxes. Avoid GPL `mutagen`, AGPL `Dangerzone`, and proprietary `TrID`.
4. **No Arbitrary AI Risk Scores:** Forensic findings and risk assessments will use deterministic, explainable rule engines tied to parser evidence.
5. **Visual Direction:** Combine the serene, ultra-simple landing restraint of `Railroad.ai`/`dispatch`/`Atlas` with the crisp technical workspace discipline of `BlacX`/`ImHex`, executed in deep graphite (`#0B0D10`), dark charcoal (`#12161C`), off-white (`#F4F4F5`), restrained terminal green (`#22C55E` / `#34D399`), muted amber, and controlled red.

---

## 8. Risks & Unresolved Questions

| Risk / Question | Impact | Mitigation / Resolution Path |
| :--- | :--- | :--- |
| **ExifTool & FFprobe container licensing** | Redistributing GPL/Artistic binaries in commercial SaaS/containers requires careful notice/source compliance | Keep them strictly as isolated backend subprocesses (never compiled/linked into core app); verify FFmpeg LGPL-only build flags in Phase 2/5. |
| **Safari / iOS low-memory tab crashes on >1 GB files** | Mobile Safari may terminate tabs under heavy WASM heap allocation | Keep chunk sizes conservative (8–16 MB on mobile/Safari), avoid holding multiple buffers, and test explicitly on Safari/mobile viewports. |
| **COOP/COEP header conflicts** | Enabling `SharedArrayBuffer` restricts cross-origin assets | Avoid mandatory `SharedArrayBuffer` in MVP; use single-threaded WASM + Transferable `ArrayBuffer`s. |
| **Production domain & contact addresses** | Footer/legal/security pages need real canonical domain & email | Use clean configurable environment/brand constants until deployment domain is chosen. |

---

## 9. Recommended Next Phase

Proceed to **Phase 1 — Requirements & Product Documentation** (`docs/00-product-vision.md`, `docs/02-requirements.md`, `docs/05-file-format-support.md`, `docs/14-known-limitations.md`) once this Phase 0 Research Summary is reviewed and approved.
