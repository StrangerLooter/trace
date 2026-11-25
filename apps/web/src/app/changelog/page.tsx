import React from "react";
import { StaticDocShell } from "@/components/ui/static-doc-shell";

export default function ChangelogPage() {
  return (
    <StaticDocShell
      eyebrow="Changelog"
      title="Engineering milestones."
      lead="Transparent log of architecture, parser, forensic, security, and UI milestones."
    >
      <article className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-6">
        <span className="font-mono-tech text-xs text-[var(--accent-primary)]">
          2026-11-25 • Editorial Design Refresh &amp; PDF Hex Offsets
        </span>
        <h2 className="mt-2 text-lg font-medium text-[var(--text-primary)]">
          Reference Design Architecture, PDF Offset Mapping &amp; Multi-Layer FAQ
        </h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>Added Instrument Serif + Inter + JetBrains Mono design tokens and atmospheric dark architectural backdrop.</li>
          <li>Mapped PDF object body structures and uncompressed Info dictionary keys to clickable Hex Inspector byte offsets.</li>
          <li>Auto-switched workspace tabs to Hex Inspector on any offset jump across Overview, Metadata, and Forensics.</li>
          <li>Documented multi-layer OS vs. EXIF timestamps across messenger re-encoding workflows.</li>
        </ul>
      </article>

      <article className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-6">
        <span className="font-mono-tech text-xs text-[var(--accent-primary)]">
          2026-11-25 • Phases 5–18 Core Platform &amp; Hardening
        </span>
        <h2 className="mt-2 text-lg font-medium text-[var(--text-primary)]">
          Full Monorepo Parsers, Forensics, Sanitization, Hex &amp; Container API
        </h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>Implemented bounded <code className="font-mono-tech">Blob.slice()</code> reader and 25+ magic-number signature rules with mismatch detection.</li>
          <li>Built parsers for JPEG, PNG, WebP, TIFF, MP3, WAV, MP4, PDF, ZIP/Office OpenXML, PE, and ELF.</li>
          <li>Added deterministic forensic rules, lossless JPEG/PNG sanitizers, and versioned JSON/CSV/PDF exports.</li>
          <li>Implemented virtualized range-read Hex Inspector, real-time 22-type RE Mode, and hardened FastAPI Docker sandbox.</li>
        </ul>
      </article>

      <article className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-6">
        <span className="font-mono-tech text-xs text-[var(--accent-primary)]">
          2026-11-25 • Phase 0–4 Foundation
        </span>
        <h2 className="mt-2 text-lg font-medium text-[var(--text-primary)]">
          Research, Architecture, Threat Model &amp; Format Registry
        </h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>Completed competitive, library, license, and 5 GiB browser memory strategy research.</li>
          <li>Specified P0–P3 requirements and honest Format Support Registry.</li>
          <li>Architected local-first Web Worker pipeline and sandboxed backend security boundaries.</li>
        </ul>
      </article>
    </StaticDocShell>
  );
}
