"use client";

import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

const FAQS = [
  {
    q: "If I take a photo on Nov 22, send it on WhatsApp on Nov 25, and save it to a PC, which timestamps exist?",
    a: "You will encounter two distinct layers: (1) Filesystem Timestamps (OS-level) which reflect November 25 (the date the file was downloaded, created, and modified on the receiving PC). (2) Embedded Forensic Metadata: If sent as a standard WhatsApp image, WhatsApp re-encodes the image and strips all EXIF/GPS/Capture tags for privacy (leaving only the Nov 25 filesystem date and WhatsApp naming format). However, if sent as an uncompressed 'Document' (or via AirDrop/original transfer), the embedded EXIF 'DateTimeOriginal' will permanently preserve November 22 alongside camera hardware, shutter speed, and GPS coordinates. TRACE's Forensics engine cross-checks both layers to flag transmission discrepancies and detect metadata stripping.",
  },
  {
    q: "Are my files uploaded to a server when I inspect them?",
    a: "No. File signature verification, streaming SHA-256 hashing, range-based hex inspection, and primary metadata parsers run locally inside browser Web Workers. Optional backend processing (such as deep PDF object scrubbing or RAW MakerNotes) only occurs if you explicitly approve an upload prompt.",
  },
  {
    q: "How does TRACE inspect a 5 GB video without crashing my browser?",
    a: "TRACE never loads an entire file into a single ArrayBuffer. It reads small bounded byte windows using Blob.slice() for headers, container atoms, and virtualized hex pages, and computes SHA-256 incrementally with streaming WebAssembly chunks. Partial scans display exact coverage flags so you always know what was inspected.",
  },
  {
    q: "Why don't all metadata fields link to a byte offset in the Hex Inspector?",
    a: "TRACE never fabricates byte offsets. When a structural parser proves the exact byte range of a segment or tag, clicking the field jumps directly to that offset. When an underlying parser cannot establish exact coordinates, TRACE explicitly reports that exact offsets are unavailable.",
  },
  {
    q: "Can TRACE remove all metadata from every file format?",
    a: "No—and we never claim a universal metadata cleaner. Different formats require dedicated sanitization strategies. Removing EXIF from JPEG works very differently from scrubbing PDF object histories or remuxing MP4 atoms. Unsupported formats refuse sanitization rather than faking success.",
  },
  {
    q: "If TRACE detects trailing bytes past an end marker, is that malware or steganography?",
    a: "Not necessarily. Trailing bytes can come from benign camera quirks, concatenated previews, or interrupted transfers. TRACE reports trailing bytes as a structural anomaly requiring review, never as proof of steganography or malicious activity.",
  },
];

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="border-t border-[var(--border-subtle)] py-20 sm:py-24">
      <div className="mx-auto max-w-[840px] px-4 sm:px-6 lg:px-8">
        <p className="font-mono-tech text-[11px] uppercase tracking-[0.16em] text-[var(--accent-primary)]">
          Questions &amp; Boundaries
        </p>
        <h2 className="font-serif-display mt-2 text-3xl text-[var(--text-primary)] sm:text-4xl">
          Honest answers <span className="italic">before you inspect.</span>
        </h2>

        <div className="mt-8 divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
          {FAQS.map((item, idx) => {
            const isOpen = openIndex === idx;
            const panelId = `faq-panel-${idx}`;
            const buttonId = `faq-btn-${idx}`;
            return (
              <div key={item.q}>
                <h3>
                  <button
                    id={buttonId}
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpenIndex(isOpen ? null : idx)}
                    className="flex min-h-[56px] w-full items-center justify-between gap-4 py-4 text-left text-sm font-medium text-[var(--text-primary)] sm:text-base"
                  >
                    <span>{item.q}</span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-[var(--text-secondary)] transition-transform ${
                        isOpen ? "rotate-180" : ""
                      }`}
                      aria-hidden="true"
                    />
                  </button>
                </h3>
                {isOpen && (
                  <div
                    id={panelId}
                    role="region"
                    aria-labelledby={buttonId}
                    className="pb-5 text-sm leading-relaxed text-[var(--text-secondary)]"
                  >
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
