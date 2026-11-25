# TRACE — Testing Strategy & Corpus

**Phase:** 14–18 Quality Assurance  
**Test Runners:** `Vitest` (`pnpm test:ts`), `Pytest` (`pytest apps/api/tests`), `TypeScript` (`pnpm typecheck`), `Ruff` (`ruff check apps/api`), `Next.js` (`pnpm build:web`), `pnpm audit --prod`.

---

## 1. Automated Test Inventory (44 TS Tests + 13 Python Tests)

| Suite | File | Scope Covered |
| :--- | :--- | :--- |
| **Event System** | `packages/event-system/src/index.test.ts` | 22 canonical `RE Mode` event types, bounded 5,000-event ring buffer |
| **Binary Core** | `packages/binary-core/src/index.test.ts` | `BufferBinaryReader`, `BlobBinaryReader`, `BinaryCursor`, slice caps, `AbortSignal`, `streamSha256` vs `node:crypto` |
| **Signature Engine** | `packages/file-signatures/src/detector.test.ts` | Magic numbers (JPEG, PNG, GIF, PDF, ZIP, RAR, 7Z, ELF, PE, WebP, MP4, MOV, MP3, WAV, FLAC, OGG, TIFF, GZIP, TAR, SQLite), container refinement, corrupt `e_lfanew` guards, extension mismatches |
| **Parser Registry** | `packages/parser-registry/src/index.test.ts` | Support status lookup & size-aware `AnalysisPlan` (> 100 MiB large-file mode) |
| **Format Parsers** | `packages/parsers/src/parsers.test.ts` | JPEG, PNG, TIFF IFD loop guard, MP3/WAV, MP4 (`mdat` skip), PDF, ZIP/DOCX, PE/ELF |
| **Forensic Rules** | `packages/forensics/src/forensics.test.ts` | Clean baseline, GPS/serial/author/email/software rules, timestamp anomalies, renamed PE, trailing-byte non-malware wording |
| **Sanitizers** | `packages/sanitizers/src/sanitizers.test.ts` | Lossless JPEG/PNG cleaning + post-clean re-verification, honest `unsupported_metadata` refusal |
| **Reports** | `packages/report-schema/src/report.test.ts` | JSON schema v1.0.0, CSV formula-injection neutralization, local `pdf-lib` PDF generation |
| **Workers & E2E** | `apps/web/src/workers/worker-engines.test.ts`, `e2e-journey.test.ts` | RPC protocol, Transferable hex window reads, hash progress/abort, full upload-to-PDF-report pipeline |
| **Hex & RE Utils** | `apps/web/src/components/workspace/hex-utils.test.ts` | `DataInspector` decoding, hex/offset parsing, chunk-boundary Blob search, RE event filtering |
| **Client Security** | `packages/parsers/src/security.test.ts` | Slice OOM bounds, ZIP bomb ratio, XXE rejection in PDF/DOCX, metadata XSS inertness, CSV neutralization |
| **Backend API & Security** | `apps/api/tests/test_health.py`, `test_parsers.py`, `test_sanitize.py`, `test_analyze.py`, `test_rate_limit.py`, `test_security.py` | Security headers, deep PDF extraction, 1x PDF sanitize & download cleanup, `413`/`415`/`404`/`429`, crash scratch cleanup, subprocess timeouts, `defusedxml` XXE, concurrent request isolation |
| **5 GiB Performance** | `packages/parsers/src/perf-5gb.test.ts` | `SparseFiveGibMp4Reader` (`< 65 KiB` read out of `5 GiB`) & `64 MiB` `hash-wasm` throughput |
