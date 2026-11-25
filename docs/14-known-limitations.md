# TRACE — Known Limitations & Forensic Boundaries

**Phase:** 1 — Transparency & Limitations Specification  
**Principle:** A credible forensics tool documents exactly what it cannot see, prove, or clean.

---

## 1. File Identification Limitations
1. **Signatures Do Not Prove Validity:** Matching magic bytes (`FF D8 FF`, `%PDF-`, `50 4B 03 04`) only confirms the header matches a known specification—it does not prove the rest of the file is uncorrupted, complete, or safe.
2. **Headerless & Text-Only Formats:** Plain text, CSV, JSON, raw PCM audio, or custom binary blobs have no reliable binary magic number. TRACE classifies these cautiously as `Probable` or `Unknown` rather than guessing aggressively.
3. **Polyglot Files:** A single file can validly satisfy two format specifications simultaneously (e.g., GIFAR or PDF+ZIP). TRACE reports primary container/header matches and flags conflicting secondary signatures when detected, rather than claiming a single exclusive reality.

---

## 2. Browser & Large-File (5 GB+) Limitations
1. **Partial Inspection by Default on Multi-GB Media:** Loading 5 GB into browser memory crashes tabs. In browser-only mode, TRACE inspects headers, footers (where applicable), and seekable container box headers—it does **not** decode every video/audio frame unless streamed or escalated to the backend with user consent.
2. **Browser Memory Variance (Especially Safari / iOS):** Mobile Safari and iOS WebKit enforce stricter tab memory limits than desktop Chrome/Firefox. Streaming hashing and hex paging use small bounded slices (8–32 MB), yet very high concurrent worker workloads on low-RAM mobile devices may still be throttled by the OS.
3. **Browser Parser Gaps:** Proprietary camera RAW MakerNotes (`ExifTool`), full media stream probing (`FFprobe`), and deep PDF object graph sanitization (`qpdf`) cannot run reliably in pure browser JS without prohibitive WASM bundle sizes (>30 MB) or missing specs; these require explicit-consent backend processing.

---

## 3. Forensic & Anomaly Interpretation Limitations
1. **Trailing Bytes Are Not Proof of Steganography or Malware:** Unexpected bytes after JPEG `FF D9` or PNG `IEND` can result from benign camera quirks, concatenated thumbnails, faulty transfers, or deliberate appending. TRACE reports trailing bytes strictly as an **indicator/anomaly requiring review**, never as proof of steganography or malicious intent.
2. **No Universal EOF Marker:** Many formats (MP4, ZIP, ELF, PE) have no single "end-of-file" sentinel—structural boundaries depend on declared box sizes, section tables, or central directories. Boundary checks are strictly format-specific.
3. **Timestamps Can Be Spoofed or Timezone-Ambiguous:** EXIF `DateTimeOriginal` often lacks timezone offsets; PE `TimeDateStamp` values can be zeroed or forged by compilers/packers (e.g., reproducible builds or Delphi/Go toolchains). TRACE displays raw values and flags anomalies without asserting ground-truth chronological certainty.
4. **Not a Court-Certified Forensic Suite:** TRACE does not implement formal forensic acquisition hardware write-blocking, NIST CFTT formal certification, or legal chain-of-custody notarization.

---

## 4. Metadata Sanitization Limitations
1. **No Universal Cleaner:** Stripping metadata from JPEG segments is fundamentally different from scrubbing PDF object trees or Office XML packages. Unsupported formats cannot be sanitized.
2. **PDF Incremental Updates & Hidden Objects:** Simply clearing `/Author` in a PDF Info dictionary leaves prior revisions, XMP streams, annotations, form values, or embedded files inside the raw byte stream. Reliable PDF cleaning requires structural rewriting (`pikepdf`/`qpdf`) and may still miss visual content burned into page graphics (e.g., redaction boxes drawn visually over selectable text).
3. **Digital Signature Invalidation:** Removing or rewriting metadata in signed PDFs, signed Office documents, or code-signed binaries invalidates cryptographic signatures. TRACE warns users before proceeding.
4. **Content-Embedded PII:** Metadata sanitization removes **container/tag metadata**, not personally identifiable information inside pixel data (e.g., faces, license plates, EXIF burned onto a photo as visible text) or spoken audio/document body text.
5. **Physical Deletion Semantics:** On server-side consented jobs, deleting temporary files removes OS filesystem/object references (`unlink`). Cloud block storage or SSD wear-leveling prevents guaranteeing instantaneous physical media erasure.

---

## 5. Byte-Offset Precision Limitations
- When a parser returns a tag via an external library (e.g., `ExifTool` or `mediainfo.js`) that does not expose raw byte offsets for every nested attribute, TRACE leaves `byteRange` unset and displays *"Exact byte offset unavailable from this parser"* rather than guessing or highlighting an approximate region.
