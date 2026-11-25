import React from "react";
import { StaticDocShell } from "@/components/ui/static-doc-shell";

export default function SecurityPage() {
  return (
    <StaticDocShell
      eyebrow="Security Architecture"
      title="Every file is treated as hostile."
      lead="TRACE applies defense-in-depth across browser Web Workers, React rendering, and isolated container sandboxes."
    >
      <section className="space-y-2">
        <h2 className="text-lg font-medium text-[var(--text-primary)]">Client-Side Controls</h2>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Bounded <code className="font-mono-tech">Blob.slice()</code> reads prevent tab memory exhaustion on multi-gigabyte files.</li>
          <li>Extracted metadata values render exclusively as escaped text nodes—never HTML or inline SVG/script execution.</li>
          <li>CSV exports neutralize spreadsheet formula prefixes (<code className="font-mono-tech">= + - @</code>).</li>
          <li>RE Mode is strictly a read-only inspection view and never executes user-provided commands.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium text-[var(--text-primary)]">Backend Sandbox Controls</h2>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Non-root execution, read-only root filesystem, <code className="font-mono-tech">--cap-drop=ALL</code>, seccomp, and <code className="font-mono-tech">--network=none</code>.</li>
          <li>UUIDv4 scratch filenames, <code className="font-mono-tech">shell=False</code> subprocesses, XML external entity disabling (XXE), and ZIP bomb ratio/entry caps.</li>
          <li>One-time safe attachment downloads (<code className="font-mono-tech">nosniff</code>, <code className="font-mono-tech">CSP: sandbox</code>, <code className="font-mono-tech">no-store</code>).</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium text-[var(--text-primary)]">Vulnerability Disclosure</h2>
        <p>
          Security researchers can report findings privately via our security contact channel documented in <code className="font-mono-tech">SECURITY.md</code> (configurable per deployment).
        </p>
      </section>
    </StaticDocShell>
  );
}
