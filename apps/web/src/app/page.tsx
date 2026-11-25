import React from "react";
import Link from "next/link";
import { getImageProps } from "next/image";
import {
  ArrowRight,
  Binary,
  Check,
  Eraser,
  FileCheck2,
  Layers,
  Lock,
  ShieldAlert,
} from "lucide-react";
import heroWindowDesktop from "@/assets/hero-window-desktop.jpg";
import heroWindowMobile from "@/assets/hero-window-mobile.jpg";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";
import { HeroDropzone } from "@/components/landing/hero-dropzone";
import { ModeComparison } from "@/components/landing/mode-comparison";
import { FaqSection } from "@/components/landing/faq-section";

const CAPABILITIES = [
  {
    icon: FileCheck2,
    code: "MOD A • SIGNATURE",
    title: "True Signature Detection",
    desc: "Ignores filename extensions and browser MIME guesses. Verifies magic bytes, offsets, and nested containers.",
  },
  {
    icon: Layers,
    code: "MOD B • METADATA",
    title: "Deep Metadata Extraction",
    desc: "Normalizes EXIF, GPS, XMP, IPTC, MP4 atoms, ID3 tags, PDF dictionaries, and executable headers.",
  },
  {
    icon: ShieldAlert,
    code: "MOD C • FORENSICS",
    title: "Explainable Forensics",
    desc: "Deterministic privacy and integrity findings with evidence, severity ratings, and zero arbitrary AI scores.",
  },
  {
    icon: Binary,
    code: "MOD E • BINARY",
    title: "Virtualized Hex & RE Mode",
    desc: "Range-read 5 GB files smoothly. Click any verified field offset to jump straight to its raw bytes.",
  },
  {
    icon: Eraser,
    code: "MOD D • SANITIZE",
    title: "Verifiable Sanitization",
    desc: "Format-specific metadata removal with before/after re-inspection and honest integrity warnings.",
  },
  {
    icon: Lock,
    code: "MOD F • PRIVACY",
    title: "Local-First Privacy",
    desc: "Web Workers keep bytes on your device by default. Server tools run only with explicit consent.",
  },
];

const FORMAT_FAMILIES = [
  {
    name: "Images",
    items: "JPEG, PNG, WebP, TIFF, GIF, HEIC, AVIF, SVG, RAW",
    status: "P0/P1 Core",
  },
  {
    name: "Audio",
    items: "MP3 (ID3), WAV (RIFF), FLAC, OGG, OPUS, M4A, AIFF",
    status: "P1 Planned",
  },
  {
    name: "Video",
    items: "MP4, MOV, MKV, WebM, AVI, 3GP, FLV",
    status: "P0 MP4 / P1",
  },
  {
    name: "Documents & Office",
    items: "PDF, DOCX, XLSX, PPTX, ODT, ODS, ODP, RTF",
    status: "P0 PDF / P1",
  },
  {
    name: "Archives",
    items: "ZIP, GZIP, RAR, 7Z, TAR, BZIP2",
    status: "P0 ZIP / P2",
  },
  {
    name: "Executables & Binary",
    items: "Windows PE, Linux ELF, macOS Mach-O, SQLite, Unknown",
    status: "ID P0 / Deep P2",
  },
];

export default function HomePage() {
  const { props: desktopBgProps } = getImageProps({
    alt: "",
    fill: true,
    priority: true,
    quality: 82,
    sizes: "100vw",
    placeholder: "blur",
    src: heroWindowDesktop,
  });
  const {
    props: { style: mobileBgStyle, ...mobileBgRest },
  } = getImageProps({
    alt: "",
    fill: true,
    priority: true,
    quality: 82,
    sizes: "100vw",
    placeholder: "blur",
    src: heroWindowMobile,
  });

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main id="main-content" className="flex-1">
        {/* WINDOW-FRAMED HERO WITH RESPONSIVE ALPINE VISTA & FROSTED CABIN HUD */}
        <section className="relative isolate flex min-h-[560px] items-center overflow-hidden border-b border-[var(--border-subtle)] bg-[#08131a] px-3 py-10 sm:min-h-[640px] sm:px-6 sm:py-16 lg:min-h-[700px] lg:py-20">
          {/* Responsive art-directed photography: wide cabin vista on desktop, portrait window on mobile */}
          <picture className="pointer-events-none absolute inset-0 z-0 block h-full w-full">
            <source media="(min-width: 768px)" srcSet={desktopBgProps.srcSet} sizes="100vw" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              {...mobileBgRest}
              alt=""
              aria-hidden="true"
              style={{
                ...mobileBgStyle,
                objectFit: "cover",
                objectPosition: "center",
              }}
              className="h-full w-full select-none object-cover object-center"
            />
          </picture>

          {/* Subtle depth vignette & bottom horizon transition into page body */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0"
            style={{
              background:
                "radial-gradient(ellipse 75% 70% at 50% 45%, rgba(8, 19, 26, 0.14) 0%, rgba(8, 19, 26, 0.62) 100%)",
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-28 bg-gradient-to-b from-transparent to-[var(--bg-primary)]/90"
          />

          <div className="relative z-10 mx-auto w-full max-w-[1240px]">
            <div className="relative mx-auto max-w-[780px] rounded-[26px] border border-white/20 bg-[#08131a]/64 px-4 py-10 text-center shadow-[0_28px_90px_rgba(4,10,15,0.58),inset_0_1px_0_rgba(255,204,166,0.34)] backdrop-blur-md sm:px-10 sm:py-14">
              {/* Subtle copper-tinted corner rivet anchors matching the window frame */}
              <span aria-hidden="true" className="absolute top-4 left-4 h-1.5 w-1.5 rounded-full bg-[#e58649]/65" />
              <span aria-hidden="true" className="absolute top-4 right-4 h-1.5 w-1.5 rounded-full bg-[#e58649]/65" />
              <span aria-hidden="true" className="absolute bottom-4 left-4 h-1.5 w-1.5 rounded-full bg-white/30" />
              <span aria-hidden="true" className="absolute bottom-4 right-4 h-1.5 w-1.5 rounded-full bg-white/30" />

              <p className="font-mono-tech inline-flex items-center gap-2 rounded-full border border-white/20 bg-[#09151d]/75 px-3.5 py-1 text-[10px] uppercase tracking-[0.16em] text-[#e2e8f0]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#e58649]" aria-hidden="true" />
                <span>TRACE WORKSPACE • ZERO-UPLOAD BINARY FORENSICS</span>
              </p>

              <h1 className="font-serif-display mt-6 text-5xl leading-[1.02] tracking-[-0.02em] text-[#f8fafc] sm:text-7xl lg:text-[84px]">
                Look beyond <span className="italic text-[#fde6cf]">the file.</span>
              </h1>

              <p className="mx-auto mt-5 max-w-[54ch] text-sm leading-relaxed text-[#dbe6f0] sm:text-base">
                Inspect hidden metadata, verify binary signatures, trace raw byte
                offsets, and strip sensitive tags—without uploading your files.
              </p>

              <HeroDropzone />

              <div className="mt-7 flex flex-wrap items-center justify-center gap-5 text-xs text-[#cbd5e1]">
                <Link
                  href="#re-mode"
                  className="inline-flex items-center gap-1.5 font-medium text-[#f8fafc] transition-colors hover:text-[#34d399]"
                >
                  <span>Explore the Engine</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
                <span aria-hidden="true" className="text-white/30">
                  /
                </span>
                <Link href="/formats" className="transition-colors hover:text-[#f8fafc]">
                  Format Registry
                </Link>
                <span aria-hidden="true" className="text-white/30">
                  /
                </span>
                <Link href="/workspace" className="transition-colors hover:text-[#f8fafc]">
                  Open Workspace
                </Link>
              </div>
            </div>

            {/* Vertical byte depth telemetry along the dark cabin pillar on desktop */}
            <aside
              aria-hidden="true"
              className="pointer-events-none absolute top-10 right-2 hidden flex-col items-end gap-3 rounded-xl border border-white/15 bg-[#08131a]/65 px-3 py-4 font-mono-tech text-[10px] tracking-[0.14em] text-[#cbd5e1] backdrop-blur-sm xl:flex"
            >
              <span>0 B • SURFACE</span>
              <span className="h-7 w-px bg-white/25" />
              <span className="text-[#e58649]">64 B • SIGNATURE</span>
              <span className="h-7 w-px bg-white/25" />
              <span className="text-[#34d399]">4 KB • METADATA</span>
              <span className="h-7 w-px bg-white/25" />
              <span>EOF • RAW BYTES</span>
            </aside>
          </div>
        </section>

        {/* ATLAS-INSPIRED SURFACE VS BENEATH HORIZON STATEMENT */}
        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
            <div className="grid gap-8 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-6 sm:p-10 lg:grid-cols-12 lg:items-center">
              <div className="lg:col-span-7">
                <p className="font-mono-tech text-[11px] uppercase tracking-[0.16em] text-[var(--accent-primary)]">
                  Beneath the Surface • Every File Has a Story
                </p>
                <h2 className="font-serif-display mt-3 text-3xl leading-[1.12] text-[var(--text-primary)] sm:text-4xl">
                  A filename extension is a suggestion, <span className="italic">not a fact.</span>
                </h2>
              </div>
              <div className="space-y-2 border-l border-[var(--border-subtle)] pl-5 font-mono-tech text-xs leading-relaxed text-[var(--text-secondary)] lg:col-span-5">
                <p className="text-[var(--text-primary)]">VISIBLE SURFACE: photo.jpg • 3.8 MB</p>
                <p>BENEATH (0x00000014): GPSLatitude, BodySerialNumber</p>
                <p>BENEATH (0x000002B8): Software, Creation Timeline</p>
                <p className="text-[var(--accent-primary)]">TRACE REVEALS EVERY LAYER LOCALLY.</p>
              </div>
            </div>
          </div>
        </section>

        {/* CAPABILITY SHOWCASE (Clean Grid + Editorial Specimen Captions) */}
        <section className="border-t border-[var(--border-subtle)] py-20 sm:py-24">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
            <p className="font-mono-tech text-[11px] uppercase tracking-[0.16em] text-[var(--accent-primary)]">
              Capabilities
            </p>
            <h2 className="font-serif-display mt-2 text-3xl text-[var(--text-primary)] sm:text-4xl">
              Six core intelligence modules.
            </h2>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {CAPABILITIES.map((cap) => {
                const Icon = cap.icon;
                return (
                  <article
                    key={cap.title}
                    className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-6 transition-colors hover:border-[var(--border-strong)]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Icon
                        className="h-4 w-4 text-[var(--accent-primary)]"
                        aria-hidden="true"
                      />
                      <span className="font-mono-tech text-[10px] tracking-[0.12em] text-[var(--text-muted)]">
                        {cap.code}
                      </span>
                    </div>
                    <h3 className="mt-4 text-base font-medium text-[var(--text-primary)]">
                      {cap.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                      {cap.desc}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* INTERACTIVE ANALYSIS VS RE MODE */}
        <ModeComparison />

        {/* HOW IT WORKS */}
        <section
          id="how-it-works"
          className="border-t border-[var(--border-subtle)] py-20 sm:py-24"
        >
          <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
            <p className="font-mono-tech text-[11px] uppercase tracking-[0.16em] text-[var(--accent-primary)]">
              Pipeline
            </p>
            <h2 className="font-serif-display mt-2 text-3xl text-[var(--text-primary)] sm:text-4xl">
              Local by default. <span className="italic">Consented when deeper tools help.</span>
            </h2>

            <div className="mt-10 grid gap-6 md:grid-cols-3">
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-6">
                <span className="font-mono-tech text-xs text-[var(--accent-primary)]">
                  01 / INGEST &amp; IDENTIFY
                </span>
                <h3 className="mt-3 text-lg font-medium text-[var(--text-primary)]">
                  Verify binary signature
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                  A Web Worker reads bounded header bytes via{" "}
                  <code className="font-mono-tech">Blob.slice()</code>, matches
                  magic numbers, flags extension mismatches, and streams SHA-256.
                </p>
              </div>

              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-6">
                <span className="font-mono-tech text-xs text-[var(--accent-primary)]">
                  02 / EXTRACT &amp; INSPECT
                </span>
                <h3 className="mt-3 text-lg font-medium text-[var(--text-primary)]">
                  Investigate both lenses
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                  Review grouped metadata and privacy findings in Analysis Mode,
                  or toggle RE Mode to follow real parser events and hex offsets.
                </p>
              </div>

              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-6">
                <span className="font-mono-tech text-xs text-[var(--accent-primary)]">
                  03 / CLEAN OR EXPORT
                </span>
                <h3 className="mt-3 text-lg font-medium text-[var(--text-primary)]">
                  Sanitize &amp; verify output
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                  Strip supported metadata into a clean copy (preserving the
                  original) or export JSON, CSV, and PDF intelligence reports.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* FORMAT FAMILIES & HONESTY MATRIX */}
        <section className="border-t border-[var(--border-subtle)] py-20 sm:py-24">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="font-mono-tech text-[11px] uppercase tracking-[0.16em] text-[var(--accent-primary)]">
                  Format Registry
                </p>
                <h2 className="font-serif-display mt-2 text-3xl text-[var(--text-primary)] sm:text-4xl">
                  Honest support across format families.
                </h2>
              </div>
              <Link
                href="/formats"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--accent-primary)] hover:underline"
              >
                <span>Full Support Matrix</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FORMAT_FAMILIES.map((fam) => (
                <div
                  key={fam.name}
                  className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-medium text-[var(--text-primary)]">
                      {fam.name}
                    </h3>
                    <span className="font-mono-tech rounded-full border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2.5 py-0.5 text-[11px] text-[var(--text-secondary)]">
                      {fam.status}
                    </span>
                  </div>
                  <p className="mt-2.5 text-xs leading-relaxed text-[var(--text-secondary)]">
                    {fam.items}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PRIVACY PLEDGE + SANITIZATION HIGHLIGHT */}
        <section className="border-t border-[var(--border-subtle)] py-20 sm:py-24">
          <div className="mx-auto grid max-w-[1200px] gap-8 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-6 sm:p-8">
              <p className="font-mono-tech text-[11px] uppercase tracking-[0.16em] text-[var(--accent-primary)]">
                Privacy Architecture
              </p>
              <h2 className="font-serif-display mt-2 text-2xl text-[var(--text-primary)] sm:text-3xl">
                Your files stay in your browser.
              </h2>
              <ul className="mt-5 space-y-3 text-sm text-[var(--text-secondary)]">
                {[
                  "Zero silent uploads — explicit consent required for backend tools",
                  "Zero accounts, tracking scripts, or third-party AI metadata sharing",
                  "Volatile tab memory by default — cleared immediately on close",
                  "Bounded Blob.slice() reads safe for 5 GB+ local video files",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <Check
                      className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-primary)]"
                      aria-hidden="true"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/privacy"
                className="mt-6 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent-primary)] hover:underline"
              >
                <span>Read Privacy Policy</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>

            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-6 sm:p-8">
              <p className="font-mono-tech text-[11px] uppercase tracking-[0.16em] text-[var(--accent-primary)]">
                Metadata Sanitizer
              </p>
              <h2 className="font-serif-display mt-2 text-2xl text-[var(--text-primary)] sm:text-3xl">
                Verified cleaning, <span className="italic">never fake promises.</span>
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
                Select specific metadata groups to strip, inspect structural
                warnings before proceeding, keep your original file untouched,
                and review a verified before-and-after diff.
              </p>
              <div className="mt-5 space-y-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-4 font-mono-tech text-xs">
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">EXIF / GPS</span>
                  <span className="text-[var(--accent-primary)]">Removed &amp; verified</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">Original file</span>
                  <span className="text-[var(--text-primary)]">Preserved untouched</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">Unsupported format</span>
                  <span className="text-[var(--status-warning)]">Explicitly refused</span>
                </div>
              </div>
              <Link
                href="/guides"
                className="mt-6 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent-primary)] hover:underline"
              >
                <span>Explore Forensic Guides</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <FaqSection />

        {/* FINAL CTA */}
        <section className="border-t border-[var(--border-subtle)] py-20 text-center">
          <div className="mx-auto max-w-[720px] px-4 sm:px-6">
            <h2 className="font-serif-display text-3xl text-[var(--text-primary)] sm:text-5xl">
              Ready to see what your files <span className="italic">actually hold?</span>
            </h2>
            <p className="mt-4 text-sm text-[var(--text-secondary)] sm:text-base">
              Open the workspace locally in seconds. No sign-up required.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link
                href="/workspace"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[var(--cta-bg)] px-6 py-2.5 text-sm font-medium text-[var(--cta-text)] transition-opacity hover:opacity-90"
              >
                <span>Open Analysis Workspace</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href="/security"
                className="inline-flex min-h-[44px] items-center rounded-full border border-[var(--border-strong)] px-6 py-2.5 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
              >
                Review Security Model
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
