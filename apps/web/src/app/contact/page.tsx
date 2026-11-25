"use client";

import React, { useState } from "react";
import { StaticDocShell } from "@/components/ui/static-doc-shell";

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusNote, setStatusNote] = useState("");
  const [topic, setTopic] = useState("format-request");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || message.trim().length < 5) {
      setStatusNote("Please enter at least 5 characters.");
      return;
    }
    setSubmitting(true);
    setStatusNote("");
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
      const resp = await fetch(`${apiBase}/api/v1/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          email: email.trim() || null,
          message: message.trim(),
        }),
      });
      if (resp.ok) {
        setStatusNote("Feedback submitted to TRACE backend API.");
      } else {
        setStatusNote("Feedback validated locally (backend returned validation error).");
      }
    } catch {
      setStatusNote("Feedback validated locally (backend API offline in local-only mode).");
    } finally {
      setSubmitting(false);
      setSubmitted(true);
    }
  };

  return (
    <StaticDocShell
      eyebrow="Contact & Creator"
      title="Request a parser or connect with the architect."
      lead="TRACE is designed and built by Ram Vishwakarma. For parser requests, collaboration, or security disclosures, leave a note below."
    >
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 text-xs text-[var(--text-secondary)]">
        <p className="font-medium text-[var(--text-primary)]">Project Architect &amp; Maintainer</p>
        <p className="mt-1">
          <strong className="text-[var(--text-primary)]">Ram Vishwakarma</strong> — Creator of TRACE File Intelligence.
        </p>
        <p className="font-mono-tech mt-1 text-[11px] text-[var(--text-muted)]">
          Repository &amp; Local Engine: MetaData Reader Workspace
        </p>
      </div>
      {submitted ? (
        <div
          role="status"
          className="rounded-xl border border-[var(--accent-primary)]/40 bg-[var(--accent-soft)] p-6 text-sm text-[var(--text-primary)]"
        >
          <p className="font-medium">Thank you for your feedback</p>
          <p className="mt-1 text-[var(--text-secondary)]">{statusNote}</p>
          <button
            type="button"
            onClick={() => {
              setSubmitted(false);
              setMessage("");
              setStatusNote("");
            }}
            className="mt-4 rounded-full border border-[var(--border-strong)] px-4 py-2 text-xs font-medium text-[var(--text-primary)]"
          >
            Send Another Message
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5 max-w-lg">
          <div>
            <label
              htmlFor="contact-topic"
              className="block text-xs font-medium uppercase tracking-wider text-[var(--text-primary)]"
            >
              Topic
            </label>
            <select
              id="contact-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="mt-2 min-h-[44px] w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-secondary)] px-3 text-sm text-[var(--text-primary)]"
            >
              <option value="format-request">Format / Parser Request</option>
              <option value="bug-report">Bug Report</option>
              <option value="security">Security / Responsible Disclosure</option>
              <option value="general">General Inquiry</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="contact-email"
              className="block text-xs font-medium uppercase tracking-wider text-[var(--text-primary)]"
            >
              Email (Optional, only if you want a reply)
            </label>
            <input
              id="contact-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-2 min-h-[44px] w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-secondary)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
          </div>

          <div>
            <label
              htmlFor="contact-message"
              className="block text-xs font-medium uppercase tracking-wider text-[var(--text-primary)]"
            >
              Details *
            </label>
            <textarea
              id="contact-message"
              required
              minLength={5}
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe the file format, parser limitation, or issue..."
              className="mt-2 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-secondary)] p-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
          </div>

          {statusNote && <p className="text-xs text-[var(--status-critical)]">{statusNote}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-[var(--cta-bg)] px-6 text-sm font-medium text-[var(--cta-text)] transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {submitting ? "Submitting..." : "Submit Feedback"}
          </button>
        </form>
      )}
    </StaticDocShell>
  );
}
