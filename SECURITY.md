# Security Policy

## Core Security Posture

TRACE treats every analyzed or uploaded file as **potentially hostile**.

- **Local-First Execution:** Browser Web Workers process files via bounded `Blob.slice()` reads with zero silent uploads.
- **No Arbitrary Execution:** `RE Mode` is a read-only inspection view; uploaded files are never executed or served inline from the application origin.
- **Hardened Backend Sandboxes:** Consented backend workers run non-root, with read-only root filesystems, `--cap-drop=ALL`, `--network=none`, UUIDv4 filenames, `shell=False` subprocess execution, and deterministic temporary file deletion.

## Reporting a Vulnerability

Please **do not** open public GitHub issues for security vulnerabilities.

1. Contact the maintainers privately via the security contact configured for your deployment (`security@trace-forensics.example` placeholder in repository templates).
2. Include reproduction steps, affected component (`apps/web`, `apps/api`, or `packages/*`), and minimal proof-of-concept fixture details (without sensitive personal data).
3. We aim to acknowledge reports within 48 hours and provide remediation status updates as fixes are validated.
