import React from "react";
import { StaticDocShell } from "@/components/ui/static-doc-shell";

export default function TermsPage() {
  return (
    <StaticDocShell
      eyebrow="Terms & Forensic Disclaimer"
      title="Permitted use & evidentiary boundaries."
      lead="Clear rules on how TRACE should be interpreted for privacy, security research, and investigative workflows."
    >
      <section className="space-y-2">
        <h2 className="text-lg font-medium text-[var(--text-primary)]">1. Not a Court-Certified Forensic Suite</h2>
        <p>
          TRACE is an educational, privacy, and technical file intelligence tool. Unless formally validated against your jurisdiction&apos;s forensic standards, outputs do not constitute certified legal or chain-of-custody evidence.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium text-[var(--text-primary)]">2. Anomalies Are Indicators, Not Proof</h2>
        <p>
          Structural indicators such as extension mismatches, truncated headers, or trailing bytes past an end marker warrant further review—they do not prove malicious intent, steganography, or confirmed tampering.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium text-[var(--text-primary)]">3. Sanitization Boundaries</h2>
        <p>
          Metadata sanitization targets supported container and tag structures only. It cannot remove personal information rendered inside image pixels, audio speech, or document body text. Always verify critical files before sharing.
        </p>
      </section>
    </StaticDocShell>
  );
}
