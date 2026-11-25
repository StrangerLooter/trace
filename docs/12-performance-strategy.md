# TRACE — Performance Engineering & Observed Benchmarks

**Phase:** 16 — Performance & Optimization  
**Status:** Verified with Local Benchmarks

---

## 1. Performance Budgets & Enforcement

| Target Area | Budget | Actual Measured Result | Mechanism |
| :--- | :--- | :--- | :--- |
| **Landing Page Initial JS (`/`)** | `< 120 kB` First Load JS | **`119 kB`** (`7.25 kB` route + `103 kB` shared) | Static App Router page; zero WASM/worker imports on `/` |
| **Workspace Shell (`/workspace`)** | Lazy-loaded heavy panes | **`124 kB`** (`11.5 kB` route + `103 kB` shared) | `next/dynamic` splits `HexInspector`, `ReModePanel`, `SanitizerPanel`, `ExportPanel` (`pdf-lib`) & Web Workers |
| **Static Policy & Guide Routes** | `< 115 kB` First Load JS | **`109–111 kB`** | Pure Server/Static components |
| **5 GiB MP4 Container Triage** | `< 500 ms`, `< 1 MiB` I/O | **`2.93 ms`** sig + **`5.86 ms`** parse, **`65,604 B`** read | `BinaryReader` skips `mdat` payloads via 64-bit box-size offset arithmetic |
| **Streaming SHA-256 (`hash-wasm`)** | Flat heap (`<= 64 MiB` peak) | **`81.3 MB/s`** (`787.18 ms` for `64 MiB`), **`-0.27 MB`** heap delta | Bounded `16 MiB` `Blob.slice()` chunks inside `HashWorker` |

---

## 2. Optimizations Implemented

1. **Zero-Copy Worker I/O & Transferables:** `WorkerCoordinator` clones the lightweight `File` descriptor to Dedicated Workers (`AnalysisWorker`, `HashWorker`) and transfers tightly-sized `ArrayBuffer` ownership for `2 KB` Hex Inspector pages.
2. **React Render Isolation (`React.memo`):** Wrapped `MetadataPanel` and `HexInspector` in `React.memo` so background `HashWorker` progress ticks (`1%..100%`) and `RE Mode` event appends do not trigger redundant hex-grid or metadata-table reconciliation.
3. **Dynamic Code Splitting:** Heavy inspection modules (`HexInspector`, `ReModePanel`, `SanitizerPanel`, `ExportPanel` / `pdf-lib`) load on demand only when selected in `/workspace`.
4. **Bounded Event Ring Buffer:** `BoundedEventEmitter` and `useWorkspaceStore` cap stored events at `5,000` per file to prevent unbounded array growth on complex containers.
5. **Offset-Skipped Binary Walkers:** `Mp4Parser` skips `mdat` and `PngParser` skips `IDAT` payloads via `BinaryReader` seeks, reading only structural headers/atoms.

---

## 3. Benchmark Methodology & Scope Note

- **5 GiB MP4 Benchmark (`packages/parsers/src/perf-5gb.test.ts`):** Executed against `SparseFiveGibMp4Reader` (`5 * 1024^3` = `5,368,709,120` bytes) containing valid `ftyp`, `moov`/`mvhd`, and a 64-bit extended `mdat` box. Proves signature detection and container box parsing do not allocate or scan `mdat` bytes.
- **64 MiB SHA-256 Benchmark (`packages/parsers/src/perf-5gb.test.ts`):** Executed real `hash-wasm` SHA-256 over `67,108,864` bytes in `16 MiB` bounded slices in Node/Vitest, measuring `81.3 MB/s` (including initial WASM compilation) and `-0.27 MB` V8 heap delta.
- **Real-Device Caveat:** Browser disk read latency on physical HDDs/mobile flash storage and Safari WebKit memory pressure differ from desktop Node tests and should be profiled on target mobile devices during release QA.
