# Contributing to TRACE

Thank you for helping build TRACE into a technically accurate, privacy-first file intelligence platform.

## Engineering Rules

1. **Never fabricate metadata or byte offsets.** Omit `byteRange` if a parser cannot mathematically establish exact byte coordinates.
2. **Never trust filename extensions or browser MIME types.** Always verify binary signatures first.
3. **Never load huge files into memory at once.** Use `BinaryReader` / `Blob.slice()` bounded reads.
4. **Never log raw file bytes or sensitive PII values** (`GPS`, emails, serial numbers) in diagnostic logs.
5. **Preserve existing tests and add regression fixtures** (valid, renamed, truncated, malformed) for every parser change.

## Local Checks Before Opening a PR

```bash
pnpm typecheck
pnpm lint
pnpm test:ts
pnpm test:api
```
