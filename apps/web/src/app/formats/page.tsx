import React from "react";
import { StaticDocShell } from "@/components/ui/static-doc-shell";

const FORMATS = [
  { format: "JPEG", sig: "FF D8 FF", status: "Fully supported (P0/P1)", exec: "Browser Worker", clean: "Lossless segment strip" },
  { format: "PNG", sig: "89 50 4E 47 0D 0A 1A 0A", status: "Fully supported (P0/P1)", exec: "Browser Worker", clean: "Ancillary chunk filter" },
  { format: "PDF", sig: "25 50 44 46 2D (%PDF-)", status: "Partial (P0) / Full (P1)", exec: "Browser + Consented Backend", clean: "Backend pikepdf/qpdf (P1)" },
  { format: "MP4 / MOV", sig: "ftyp @ offset 4", status: "Partial (P0/P1)", exec: "Browser Slices + Backend FFprobe", clean: "Stream-copy remux (P2)" },
  { format: "WebP / TIFF / GIF", sig: "RIFF+WEBP / II* / GIF8", status: "Partially supported (P1)", exec: "Browser Worker", clean: "Format-specific (P2)" },
  { format: "MP3 / WAV / FLAC / OGG", sig: "ID3 / RIFF+WAVE / fLaC / OggS", status: "Partially supported (P1)", exec: "Browser Worker", clean: "Tag/chunk strip (P2)" },
  { format: "DOCX / XLSX / PPTX", sig: "ZIP + OpenXML structure", status: "Partially supported (P1)", exec: "Browser Worker", clean: "docProps XML scrub (P2)" },
  { format: "ZIP / GZIP / RAR / 7Z", sig: "50 4B 03 04 / 1F 8B / Rar! / 7z", status: "Partial ZIP (P0) / ID Only", exec: "Browser + Backend (P2)", clean: "N/A (Inspection only)" },
  { format: "PE / ELF / Mach-O", sig: "MZ->PE / 7F ELF / FEEDFACE", status: "ID Only (P0) / Partial (P2)", exec: "Browser + Backend", clean: "Not applicable" },
];

export default function FormatsPage() {
  return (
    <StaticDocShell
      eyebrow="Format Support Registry"
      title="Explicit capabilities without exaggeration."
      lead="TRACE distinguishes confirmed identification from deep metadata extraction and verified sanitization across every file family."
    >
      <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
        <table className="w-full min-w-[640px] border-collapse text-left text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] font-mono-tech text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
              <th className="p-3.5">Format</th>
              <th className="p-3.5">Binary Signature</th>
              <th className="p-3.5">Registry Status</th>
              <th className="p-3.5">Execution</th>
              <th className="p-3.5">Sanitization</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {FORMATS.map((row) => (
              <tr key={row.format}>
                <td className="p-3.5 font-medium text-[var(--text-primary)]">{row.format}</td>
                <td className="font-mono-tech p-3.5 text-xs text-[var(--accent-primary)]">{row.sig}</td>
                <td className="p-3.5">{row.status}</td>
                <td className="p-3.5">{row.exec}</td>
                <td className="p-3.5">{row.clean}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </StaticDocShell>
  );
}
