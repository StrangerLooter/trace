import React from "react";
import { StaticDocShell } from "@/components/ui/static-doc-shell";

const GUIDES = [
  {
    tag: "Privacy & EXIF",
    title: "What Smartphone Photos Actually Reveal (Beyond Coordinates)",
    summary:
      "How EXIF APP1 segments store lens serials, software build strings, sub-second timestamps, and embedded preview thumbnails that survive casual cropping.",
  },
  {
    tag: "PDF Forensics",
    title: "Why Naive Metadata Strippers Fail on PDF Documents",
    summary:
      "Clearing /Author in a PDF Info dictionary leaves XMP packets, incremental update revisions, annotations, and embedded attachments intact inside raw object streams.",
  },
  {
    tag: "Browser Engineering",
    title: "Inspecting a 5 GB MP4 in Browser Web Workers Without Crashing",
    summary:
      "Combining Blob.slice(), chunked hash-wasm SHA-256, and bounded container box walks to inspect multi-gigabyte media with under 150 MB of RAM.",
  },
];

export default function GuidesPage() {
  return (
    <StaticDocShell
      eyebrow="Forensic Field Guides"
      title="Understanding what lives beneath the surface."
      lead="Technical deep-dives on file structures, metadata leakage, and safe binary investigation."
    >
      <div className="space-y-4">
        {GUIDES.map((guide) => (
          <article
            key={guide.title}
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-6"
          >
            <span className="font-mono-tech text-[11px] uppercase tracking-wider text-[var(--accent-primary)]">
              {guide.tag}
            </span>
            <h2 className="mt-2 text-lg font-medium text-[var(--text-primary)]">
              {guide.title}
            </h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">{guide.summary}</p>
          </article>
        ))}
      </div>
    </StaticDocShell>
  );
}
