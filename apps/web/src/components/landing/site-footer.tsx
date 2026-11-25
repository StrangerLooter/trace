import React from "react";
import Link from "next/link";
import { TraceLogo } from "@/components/ui/trace-logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
      <div className="mx-auto max-w-[1280px] px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <TraceLogo />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-[var(--text-secondary)]">
              Universal File Intelligence &amp; Digital Forensics Workspace.
              Inspect true binary signatures, hidden metadata, and raw byte
              offsets—locally by default.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="font-mono-tech rounded border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)]">
                TRACE File Forensics
              </span>
              <span className="font-mono-tech rounded border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)]">
                Zero-Upload Web Workers
              </span>
            </div>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-1.5">
              <span
                className="h-2 w-2 rounded-full bg-[var(--accent-primary)]"
                aria-hidden="true"
              />
              <span className="font-mono-tech text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
                Local Engine • Browser Isolated
              </span>
            </div>
          </div>

          <div>
            <h2 className="font-mono-tech text-xs font-medium uppercase tracking-wider text-[var(--text-primary)]">
              Platform
            </h2>
            <ul className="mt-4 space-y-2.5 text-sm text-[var(--text-secondary)]">
              <li>
                <Link href="/workspace" className="hover:text-[var(--text-primary)]">
                  Analysis Workspace
                </Link>
              </li>
              <li>
                <Link href="/formats" className="hover:text-[var(--text-primary)]">
                  Format Support Matrix
                </Link>
              </li>
              <li>
                <Link href="/#re-mode" className="hover:text-[var(--text-primary)]">
                  Analysis vs. RE Mode
                </Link>
              </li>
              <li>
                <Link href="/changelog" className="hover:text-[var(--text-primary)]">
                  Changelog
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="font-mono-tech text-xs font-medium uppercase tracking-wider text-[var(--text-primary)]">
              Resources
            </h2>
            <ul className="mt-4 space-y-2.5 text-sm text-[var(--text-secondary)]">
              <li>
                <Link href="/guides" className="hover:text-[var(--text-primary)]">
                  Forensic Field Guides
                </Link>
              </li>
              <li>
                <Link href="/security" className="hover:text-[var(--text-primary)]">
                  Security Architecture
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-[var(--text-primary)]">
                  Contact &amp; Format Requests
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="font-mono-tech text-xs font-medium uppercase tracking-wider text-[var(--text-primary)]">
              Legal &amp; Trust
            </h2>
            <ul className="mt-4 space-y-2.5 text-sm text-[var(--text-secondary)]">
              <li>
                <Link href="/privacy" className="hover:text-[var(--text-primary)]">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-[var(--text-primary)]">
                  Terms &amp; Forensic Disclaimer
                </Link>
              </li>
              <li>
                <Link href="/licenses" className="hover:text-[var(--text-primary)]">
                  Open-Source Licenses
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-[var(--border-subtle)] pt-8 text-xs text-[var(--text-muted)] sm:flex-row sm:items-center sm:justify-between">
          <p>
            TRACE — Investigative &amp; educational file intelligence. Not a
            court-certified forensic acquisition suite.
          </p>
          <p className="font-mono-tech">
            Zero silent uploads • Zero tracking scripts
          </p>
        </div>
      </div>
    </footer>
  );
}
