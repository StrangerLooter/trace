import React from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";

export function StaticDocShell({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main-content" className="flex-1 py-16 sm:py-20">
        <div className="mx-auto max-w-[860px] px-4 sm:px-6 lg:px-8">
          <p className="font-mono-tech text-[11px] uppercase tracking-[0.16em] text-[var(--accent-primary)]">
            {eyebrow}
          </p>
          <h1 className="font-serif-display mt-2 text-4xl text-[var(--text-primary)] sm:text-5xl">
            {title}
          </h1>
          <p className="mt-3 text-base leading-relaxed text-[var(--text-secondary)]">
            {lead}
          </p>
          <div className="mt-10 space-y-8 border-t border-[var(--border-subtle)] pt-8 text-sm leading-relaxed text-[var(--text-secondary)]">
            {children}
          </div>
          <div className="mt-12 border-t border-[var(--border-subtle)] pt-6">
            <Link
              href="/"
              className="text-xs font-medium text-[var(--accent-primary)] hover:underline"
            >
              &larr; Back to TRACE Home
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
