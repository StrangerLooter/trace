import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "TRACE — Look Beyond the File";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#0b0d10",
          backgroundImage:
            "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(34, 197, 94, 0.16), transparent)",
          color: "#f4f4f5",
          padding: "64px 72px",
          border: "1px solid #232a35",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: 999,
                backgroundColor: "#22c55e",
              }}
            />
            <span style={{ fontSize: 22, letterSpacing: "0.2em", fontWeight: 700 }}>TRACE</span>
          </div>
          <span style={{ fontSize: 16, color: "#9ca3af", letterSpacing: "0.14em" }}>
            LOCAL-FIRST FILE FORENSICS
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 74, lineHeight: 1.05, fontWeight: 600 }}>
            Look beyond the file.
          </div>
          <div style={{ fontSize: 26, color: "#9ca3af", maxWidth: 960, lineHeight: 1.4 }}>
            Verify binary signatures, inspect hidden EXIF/XMP/PDF/EBML metadata, trace raw byte offsets, and sanitize locally in browser Web Workers.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "1px solid #232a35",
            paddingTop: 24,
            fontSize: 18,
            color: "#9ca3af",
          }}
        >
          <span>Architect: Ram Vishwakarma (@StrangerLooter)</span>
          <span style={{ color: "#22c55e" }}>JPEG • PNG • WebP • HEIC • PDF • MP4 • MKV • PE/ELF</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
