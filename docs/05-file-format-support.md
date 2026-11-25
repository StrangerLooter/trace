# TRACE — File Format Support Registry

**Phase:** 1 — Format Capabilities & Honesty Matrix  
**Principle:** TRACE never claims full support where only partial or signature-only support exists. Every format declares its exact identification, metadata, forensic, hex, and sanitization capabilities.

---

## Status Definitions

| Status | Meaning |
| :--- | :--- |
| **Fully supported** | Confirmed binary signature + structural parser + normalized metadata + forensic rules + (where applicable) verified sanitization. |
| **Partially supported** | Confirmed signature + core structural/metadata extraction, with documented gaps (e.g., proprietary MakerNotes or deep streams require backend). |
| **Identification only** | Binary signature & MIME classification supported (plus hex inspection & hashing), without semantic metadata parsing yet. |
| **Experimental** | Early parser under active validation; outputs marked experimental with explicit caveats. |
| **Unsupported** | Not recognized by signature database; treated safely as raw unknown binary (`application/octet-stream`) for hashing and hex inspection. |

---

## Format Matrix by Family & Target Phase

### 1. Images

| Format | Extensions | Signature Basis | Status (Target Phase) | Execution Layer | Extracted Metadata | Sanitization Strategy & Caveats |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **JPEG** | `.jpg`, `.jpeg`, `.jpe` | `FF D8 FF` + SOI/marker validation | **Fully supported** (P0/P1) | Browser Worker (deep MakerNotes: Backend P2) | EXIF, IPTC, XMP, GPS, Camera/Lens/Serial, Exposure, Dimensions, Orientation, ICC, Software, Thumbnails | Lossless segment removal (`APP1`–`APP13`, `COM`) preserving entropy-coded image stream; re-verified post-clean. |
| **PNG** | `.png` | `89 50 4E 47 0D 0A 1A 0A` | **Fully supported** (P0/P1) | Browser Worker | `IHDR` dimensions/color, `tEXt`, `zTXt`, `iTXt` (XMP), `eXIf`, `tIME`, `pHYs`, trailing bytes after `IEND` | Lossless chunk filtering removing ancillary metadata chunks while keeping critical `IHDR`/`PLTE`/`IDAT`/`IEND` chunks intact. |
| **WebP** | `.webp` | `RIFF` + `WEBP` at offset `8` | **Partially supported** (P1) | Browser Worker | `VP8`/`VP8L`/`VP8X` dimensions, `EXIF`, `XMP`, `ICCP` chunks | RIFF chunk removal (`EXIF`, `XMP`) updating `RIFF` size header (P2). |
| **TIFF** | `.tif`, `.tiff` | `49 49 2A 00` (LE) / `4D 4D 00 2A` (BE) | **Partially supported** (P1) | Browser Worker | IFD0/EXIF/GPS/IPTC/XMP tags, byte order | Tag scrubbing requires careful IFD offset rewriting (Backend P2). |
| **GIF** | `.gif` | `GIF87a` / `GIF89a` | **Partially supported** (P1) | Browser Worker | Logical screen dimensions, frame count, Comment Extension blocks | Comment extension removal (P2). |
| **HEIC / HEIF / AVIF** | `.heic`, `.heif`, `.avif` | ISOBMFF `ftyp` (`heic`, `mif1`, `avif`) | **Partially supported** (P1/P2) | Browser (`exifr`) + Backend (`ExifTool` P2) | `ftyp` brand, EXIF/XMP/GPS (via `exifr`/ExifTool) | Container-level metadata removal (Backend P2). |
| **SVG** | `.svg` | XML `<svg` root inspection (text) | **Partially supported** (P1) | Browser Worker (safe XML parser, no DOM/script exec) | XML metadata, creator comments, embedded scripts/external URI security flags | Text/XML comment & `<metadata>` stripping (P2); never rendered as active HTML. |
| **BMP / JPEG XL** | `.bmp`, `.jxl` | `42 4D` / `FF 0A` or `00 00 00 0C 4A 58 4C 20` | **Identification only** (P1) | Browser Worker | Signature, dimensions (BMP DIB header), hashes | Not supported for sanitization. |
| **Camera RAW** (CR2/CR3/NEF/ARW/DNG) | `.cr2`, `.cr3`, `.nef`, `.arw`, `.dng` | TIFF-based or `ftyp` (`crx`) + vendor headers | **Partially supported** (P2) | Backend (`ExifTool` consented) | Standard EXIF + MakerNotes, shutter count, serials | Sanitization disabled/warned by default (proprietary RAW structures risk corruption). |

### 2. Audio

| Format | Extensions | Signature Basis | Status (Target Phase) | Execution Layer | Extracted Metadata | Sanitization Strategy & Caveats |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **MP3** | `.mp3` | `ID3` (`49 44 33`) or MPEG sync frames | **Fully supported** (P1) | Browser (`music-metadata`) | ID3v1/v2 tags, Artist, Album, Track, Genre, Encoder, Duration, Sample Rate, Artwork | Strip ID3v1/v2 tags cleanly without re-encoding MP3 audio frames (P2). |
| **WAV** | `.wav` | `RIFF` + `WAVE` at offset `8` | **Fully supported** (P1) | Browser Worker | `fmt ` (sample rate, bit depth, channels), `LIST/INFO`, `bext` (Broadcast Wave), `id3 ` chunks | Remove `LIST`/`INFO`/`id3 ` RIFF subchunks and update RIFF header size (P2). |
| **FLAC** | `.flac` | `66 4C 61 43` (`fLaC`) | **Partially supported** (P1) | Browser (`music-metadata`) | `STREAMINFO`, Vorbis comments, `PICTURE` blocks | Remove Vorbis comment & `PICTURE` metadata blocks (P2). |
| **OGG / OPUS** | `.ogg`, `.oga`, `.opus` | `4F 67 67 53` (`OggS`) | **Partially supported** (P1) | Browser (`music-metadata`) | Stream codec, Vorbis/Opus comment headers, vendor string | Unsupported for in-place browser sanitization (requires Ogg page rebuild P2). |
| **AAC / M4A / AIFF** | `.aac`, `.m4a`, `.aiff` | ADTS / `ftyp M4A ` / `FORM`+`AIFF` | **Partially supported** (P1) | Browser (`music-metadata` / `mp4box`) | Codec, duration, iTunes/ID3 tags, artwork | Backend `FFmpeg` stream-copy metadata strip (P2). |

### 3. Video

| Format | Extensions | Signature Basis | Status (Target Phase) | Execution Layer | Extracted Metadata | Sanitization Strategy & Caveats |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **MP4** | `.mp4`, `.m4v` | `ftyp` at offset `4` (`isom`, `mp42`, `avc1`, etc.) | **Partially supported** (P0) -> **Fully supported** (P1/P2) | Browser (`mp4box` + `mediainfo.js` via slices) + Backend (`FFprobe` P2) | `ftyp` brand, `moov`/`mvhd`/`tkhd`/`udta`/`meta` atoms, codecs, resolution, FPS, bitrate, rotation, creation time, chapters | Consented backend `ffmpeg -map_metadata -1 -c copy` (warns about proprietary atoms/remux changes, P2). |
| **MOV** | `.mov` | `ftyp qt  ` or `moov`/`mdat`/`wide` atom signatures | **Partially supported** (P1) | Browser (`mediainfo.js` / `mp4box`) + Backend (`FFprobe`) | QuickTime atoms, camera/iPhone metadata, GPS (`©xyz`), streams, rotation | Backend `ffmpeg` copy remux (P2); warns that Apple proprietary atoms may require explicit strip flags. |
| **MKV / WebM** | `.mkv`, `.webm` | EBML `1A 45 DF A3` + DocType (`matroska` / `webm`) | **Partially supported** (P1) | Browser (`mediainfo.js`) + Backend (`FFprobe`) | EBML Segment Info, WritingApp/MuxingApp, Tracks, Chapters, Tags | Backend `ffmpeg` copy remux (P2). |
| **AVI / FLV / MPEG / 3GP** | `.avi`, `.flv`, `.mpg`, `.3gp` | `RIFF`+`AVI ` / `46 4C 56 01` / MPEG pack / `ftyp 3gp` | **Identification only** (P0) -> **Partially supported** (P1/P2) | Browser (`mediainfo.js`) + Backend | Container ID, basic stream parameters | Backend `FFprobe` inspection; sanitization experimental/limited. |

### 4. Documents & Office Packages

| Format | Extensions | Signature Basis | Status (Target Phase) | Execution Layer | Extracted Metadata | Sanitization Strategy & Caveats |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **PDF** | `.pdf` | `%PDF-` (`25 50 44 46 2D`, within first 1024 bytes) | **Partially supported** (P0) -> **Fully supported** (P1) | Browser (`pdfjs-dist` + structural scanner) + Backend (`pikepdf`/`qpdf` P1) | Info dict (`Author`, `Creator`, `Producer`, dates), XMP stream, page count/sizes, encryption, JavaScript, forms, annotations, embedded files, signatures, incremental updates | **Backend `pikepdf`/`qpdf` required** for reliable scrubbing (removes Info + XMP + warns on incremental revisions, annotations, embedded files, and signature invalidation). Client-side Info edits alone are insufficient. |
| **DOCX / XLSX / PPTX** | `.docx`, `.xlsx`, `.pptx` | `ZIP` (`50 4B 03 04`) + internal `[Content_Types].xml` & `word/`/`xl/`/`ppt/` entries | **Partially supported** (P1) | Browser (`fflate` + `fast-xml-parser`) | `docProps/core.xml` (author, lastModifiedBy, dates, revision), `app.xml` (template, app, company), `custom.xml`, comments/tracked-change presence, embedded objects | Repackage ZIP scrubbing `docProps/*.xml` (P2); warns if comments, tracked changes, or embedded OLE objects exist. |
| **ODT / ODS / ODP** | `.odt`, `.ods`, `.odp` | `ZIP` + `mimetype` entry (`application/vnd.oasis.opendocument...`) | **Partially supported** (P1/P2) | Browser (`fflate` + `fast-xml-parser`) | `meta.xml` (creator, editing cycles, dates, generator) | Repackage scrubbing `meta.xml` (P2). |
| **RTF / EPUB / TXT** | `.rtf`, `.epub`, `.txt` | `{\rtf` / `ZIP`+`application/epub+zip` / UTF-8/BOM text heuristics | **Identification only** (P1) | Browser Worker | RTF `\info` group (P2), EPUB OPF metadata (P2), encoding/BOM for TXT | Unsupported for sanitization in P0/P1. |

### 5. Archives & Compressed Streams

| Format | Extensions | Signature Basis | Status (Target Phase) | Execution Layer | Extracted Metadata | Sanitization Strategy & Caveats |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **ZIP** | `.zip` | `50 4B 03 04` / `50 4B 05 06` (empty) | **Partially supported** (P0/P1) | Browser (`fflate` central directory inspection) | Entry list, compression ratios, timestamps, comments, encryption flags, path traversal & bomb indicators | N/A (container inspection only; never auto-extracted). |
| **GZIP** | `.gz` | `1F 8B` | **Partially supported** (P1) | Browser Worker | Header OS byte, MTIME timestamp, optional original filename (`FNAME`), comment (`FCOMMENT`) | Clear `MTIME` & `FNAME` header fields (P2). |
| **RAR / 7Z / TAR / BZIP2** | `.rar`, `.7z`, `.tar`, `.bz2` | `52 61 72 21 1A 07` / `37 7A BC AF 27 1C` / `ustar` at `257` / `42 5A 68` | **Identification only** (P1) -> **Partially supported** (P2) | Browser signature + Backend inspection (P2) | Signature, entry listing (TAR), encryption header detection | Not supported for sanitization. |

### 6. Executables & Binaries

| Format | Extensions | Signature Basis | Status (Target Phase) | Execution Layer | Extracted Metadata | Sanitization Strategy & Caveats |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Windows PE** | `.exe`, `.dll`, `.sys` | `4D 5A` (`MZ`) + `e_lfanew` -> `50 45 00 00` (`PE\0\0`) | **Identification only** (P0) -> **Partially supported** (P2) | Browser (basic PE headers P0/P2) + Backend (`pefile`/`lief` P2) | Machine arch, subsystem, compile timestamp, entry point, sections (`.text`, `.rsrc`), imports/exports, PDB debug path, overlay size, Authenticode indicator | **Sanitization Not Applicable** (modifying PE headers/overlays breaks execution & signatures). |
| **Linux ELF** | `(none)`, `.so`, `.elf`, `.o` | `7F 45 4C 46` (`\x7FELF`) | **Identification only** (P0) -> **Partially supported** (P2) | Browser (ELF header P0/P2) + Backend (`pyelftools`/`lief` P2) | Class (32/64), endianness, ABI, machine, entry point, sections, dynamic libraries (`DT_NEEDED`), build-id, interpreter | **Sanitization Not Applicable.** |
| **macOS Mach-O** | `(none)`, `.dylib`, `.bundle` | `FE ED FA CE` / `FE ED FA CF` / `CE FA ED FE` / `CF FA ED FE` / Fat `CA FE BA BE` | **Identification only** (P1) -> **Partially supported** (P2) | Backend (`macholib`/`lief` P2) | CPU type, file type, load commands, segments, dylib dependencies, code-signature load command | **Sanitization Not Applicable.** |

### 7. Other Formats (Databases, Fonts, Disk Images, Firmware, Unknown)

| Format | Extensions | Signature Basis | Status (Target Phase) |
| :--- | :--- | :--- | :--- |
| **SQLite 3** | `.db`, `.sqlite`, `.sqlite3` | `53 51 4C 69 74 65 20 66 6F 72 6D 61 74 20 33 00` | **Identification only** (P1) |
| **Fonts (TTF / OTF / WOFF / WOFF2)** | `.ttf`, `.otf`, `.woff`, `.woff2` | `00 01 00 00` / `OTTO` / `wOFF` / `wOF2` | **Identification only** (P1) -> **Experimental** (`name` table P3) |
| **Disk Images / Firmware** (ISO, DMG, QCOW2, SquashFS) | `.iso`, `.dmg`, `.qcow2`, `.squashfs` | `CD001` at `0x8001`/`0x8801` / `koly` trailer / `QFI\xFB` / `hsqs` | **Identification only** (P2) |
| **Unknown Binary** | Any | No recognized signature | **Unsupported** (Hashes, file size, byte entropy/hex inspection still work) |
