import React from "react";
import { StaticDocShell } from "@/components/ui/static-doc-shell";

export default function PrivacyPage() {
  return (
    <StaticDocShell
      eyebrow="Privacy Policy"
      title="Local by default. Explicit consent for everything else."
      lead="TRACE is architected so your files stay on your device unless you explicitly approve a remote deep-inspection or sanitization step."
    >
      <section className="space-y-2">
        <h2 className="text-lg font-medium text-[var(--text-primary)]">1. Browser-Local Processing</h2>
        <p>
          File signature detection, streaming SHA-256 hashing, range-based hex inspection, and primary metadata parsers execute inside local browser Web Workers. Zero file bytes are transmitted over the network during local analysis.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium text-[var(--text-primary)]">2. Optional Backend Processing (Explicit Consent)</h2>
        <p>
          Certain deep operations (such as structural PDF scrubbing via pikepdf/qpdf, RAW MakerNotes via ExifTool, or deep stream probing via FFprobe) require isolated backend execution. TRACE never initiates an upload silently—you must confirm a consent prompt first.
        </p>
        <p>
          Consented uploads use random UUIDv4 identifiers, are excluded from application logs, and are deleted immediately after processing/download (with a 10-minute maximum orphan TTL sweeper). Note that OS-level deletion unlinks filesystem/object references; cloud SSD wear-leveling prevents guaranteeing instantaneous physical erasure.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium text-[var(--text-primary)]">3. Zero Tracking, Zero AI Training</h2>
        <p>
          TRACE does not require user accounts, does not inject third-party ad or analytics trackers, never sends extracted personal metadata to third-party AI APIs, and never uses user files for model training.
        </p>
      </section>
    </StaticDocShell>
  );
}
