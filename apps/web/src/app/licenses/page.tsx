import React from "react";
import { StaticDocShell } from "@/components/ui/static-doc-shell";

const LICENSES = [
  { pkg: "Next.js / React / Tailwind CSS", license: "MIT", layer: "Frontend UI" },
  { pkg: "hash-wasm", license: "MIT", layer: "Browser Worker Streaming Hash" },
  { pkg: "exifr / music-metadata / fflate / fast-xml-parser / pdf-lib", license: "MIT", layer: "Browser Parsers" },
  { pkg: "exifreader / pikepdf", license: "MPL-2.0", layer: "Image & PDF Analysis" },
  { pkg: "pdfjs-dist / lief", license: "Apache-2.0", layer: "PDF & Binary Inspection" },
  { pkg: "mp4box.js / pypdf", license: "BSD-3-Clause", layer: "ISO BMFF & PDF" },
  { pkg: "mediainfo.js", license: "MIT / BSD-2-Clause", layer: "WASM Media Inspection" },
  { pkg: "pefile / macholib / FastAPI", license: "MIT", layer: "Backend API & Binaries" },
  { pkg: "pyelftools", license: "Unlicense (Public Domain)", layer: "ELF Inspection" },
  { pkg: "ExifTool (Isolated Subprocess)", license: "Artistic-1.0 or GPL-1.0+", layer: "Sandboxed Backend CLI" },
  { pkg: "FFprobe / FFmpeg (LGPL Build, Isolated Subprocess)", license: "LGPL-2.1+", layer: "Sandboxed Backend CLI" },
];

export default function LicensesPage() {
  return (
    <StaticDocShell
      eyebrow="Open-Source Attributions"
      title="Standing on permissive, audited foundations."
      lead="Full dependency license inventory across browser WebAssembly modules and isolated backend worker tools."
    >
      <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
        <table className="w-full min-w-[540px] border-collapse text-left text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] font-mono-tech text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
              <th className="p-3.5">Component</th>
              <th className="p-3.5">License</th>
              <th className="p-3.5">Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {LICENSES.map((item) => (
              <tr key={item.pkg}>
                <td className="p-3.5 font-medium text-[var(--text-primary)]">{item.pkg}</td>
                <td className="font-mono-tech p-3.5 text-xs text-[var(--accent-primary)]">{item.license}</td>
                <td className="p-3.5">{item.layer}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </StaticDocShell>
  );
}
