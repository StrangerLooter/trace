"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Menu, Moon, Sun, X } from "lucide-react";
import { TraceLogo } from "@/components/ui/trace-logo";
import { useTheme } from "@/components/ui/theme-provider";

const NAV_LINKS = [
  { href: "/#how-it-works", label: "How it works?" },
  { href: "/formats", label: "Formats" },
  { href: "/guides", label: "Guides" },
  { href: "/security", label: "Security" },
];

export function SiteHeader() {
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border-subtle)] bg-[var(--bg-glass)] backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            aria-label="TRACE Home"
            className="rounded-md py-1 focus-visible:outline-2"
          >
            <TraceLogo />
          </Link>
          <span
            aria-hidden="true"
            className="hidden h-px w-8 bg-[var(--border-strong)] lg:block"
          />
          <span className="font-mono-tech hidden text-[10px] tracking-[0.14em] text-[var(--text-muted)] xl:inline">
            LOCAL ENGINE • BROWSER ISOLATED
          </span>
        </div>

        {/* Centered floating pill nav inspired by Railroad.ai */}
        <nav
          aria-label="Primary Navigation"
          className="hidden items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-2 py-1 md:flex"
        >
          {NAV_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-3.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <Link
            href="/workspace"
            className="hidden rounded-full bg-[var(--cta-bg)] px-4 py-2 text-xs font-medium text-[var(--cta-text)] transition-opacity hover:opacity-90 sm:inline-flex"
          >
            Inspect a File
          </Link>

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav-drawer"
            aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-primary)] md:hidden"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav
          id="mobile-nav-drawer"
          aria-label="Mobile Navigation"
          className="border-t border-[var(--border-subtle)] bg-[var(--bg-primary)] px-4 py-4 md:hidden"
        >
          <ul className="flex flex-col gap-1">
            {NAV_LINKS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className="flex min-h-[44px] items-center rounded-md px-3 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li className="pt-2">
              <Link
                href="/workspace"
                onClick={() => setMobileOpen(false)}
                className="flex min-h-[44px] items-center justify-center rounded-full bg-[var(--cta-bg)] px-4 text-sm font-medium text-[var(--cta-text)]"
              >
                Inspect a File
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
