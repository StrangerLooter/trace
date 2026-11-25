import { zipSync } from "@trace/parsers";

function asciiBytes(s: string): number[] {
  return Array.from(s).map((c) => c.charCodeAt(0));
}

function u16le(v: number): number[] {
  return [v & 0xff, (v >>> 8) & 0xff];
}

function u32le(v: number): number[] {
  return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
}

/** Synthesize deterministic, safe sample evidence files locally in browser memory (#39). */
export function buildSampleEvidenceFiles(): File[] {
  // 1. Sample JPEG shot Nov 22 (EXIF + GPS + Sony) but saved to OS Nov 25
  const makeStr = asciiBytes("Sony\0");
  const modelStr = asciiBytes("ILCE-7M4\0");
  const dtStr = asciiBytes("2024:11:22 14:30:00\0");
  // Simple TIFF with Make, Model, DateTimeOriginal + GPS IFD pointer
  const tiffIfd0Start = 8;
  const tagCount = 3;
  const afterIfd0 = tiffIfd0Start + 2 + tagCount * 12 + 4;
  const offMake = afterIfd0;
  const offModel = offMake + makeStr.length;
  const offDt = offModel + modelStr.length;

  const tiff = [
    0x49, 0x49, 0x2a, 0x00, ...u32le(tiffIfd0Start),
    ...u16le(tagCount),
    ...u16le(0x010f), ...u16le(2), ...u32le(makeStr.length), ...u32le(offMake),
    ...u16le(0x0110), ...u16le(2), ...u32le(modelStr.length), ...u32le(offModel),
    ...u16le(0x0132), ...u16le(2), ...u32le(dtStr.length), ...u32le(offDt),
    ...u32le(0),
    ...makeStr, ...modelStr, ...dtStr,
  ];
  const app1Data = [...asciiBytes("Exif\0\0"), ...tiff];
  const app1Len = 2 + app1Data.length;
  const comData = asciiBytes("Original export retained DateTimeOriginal");
  const comLen = 2 + comData.length;
  const sofData = [8, 0x04, 0x38, 0x07, 0x80, 3];
  const sofLen = 2 + sofData.length;

  const sampleJpgBytes = new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe1, (app1Len >> 8) & 0xff, app1Len & 0xff, ...app1Data,
    0xff, 0xfe, (comLen >> 8) & 0xff, comLen & 0xff, ...comData,
    0xff, 0xc0, (sofLen >> 8) & 0xff, sofLen & 0xff, ...sofData,
    0xff, 0xda, 0x00, 0x04, 0x11, 0x22,
    0xff, 0xd9,
  ]);

  const nov25Ms = Date.UTC(2026, 10, 25, 10, 15, 0);
  const jpgFile = new File([sampleJpgBytes], "IMG_20241122_transfer.jpg", {
    type: "image/jpeg",
    lastModified: nov25Ms,
  });

  // 2. Tampered Multi-Revision PDF with Author, /URI, /JavaScript & trailing bytes
  const samplePdfStr =
    "%PDF-1.7\n1 0 obj\n<< /Title (Audit Draft) /Author (Ram Vishwakarma) /Producer (TRACE SynthLab) >>\nendobj\n" +
    "2 0 obj\n<< /OpenAction << /S /URI /URI (https://trace-opal-gamma.vercel.app) >> /JS (console.log(1)) >>\nendobj\n" +
    "startxref\n90\n%%EOF\n" +
    "% Incremental update revision\nstartxref\n180\n%%EOF\nTRAILING_BYTES_TEST";
  const pdfFile = new File([new Uint8Array(asciiBytes(samplePdfStr))], "sample_audit_report.pdf", {
    type: "application/pdf",
    lastModified: nov25Ms,
  });

  // 3. Extension-Spoofed DOCX disguised as .jpg
  const spoofedZip = zipSync({
    "word/document.xml": new Uint8Array(asciiBytes('<w:document><w:ins w:author="Contractor"/></w:document>')),
    "docProps/core.xml": new Uint8Array(
      asciiBytes(
        '<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>Internal Finance</dc:creator></cp:coreProperties>'
      )
    ),
  });
  const spoofFile = new File([spoofedZip.slice()], "invoice_scan_spoofed.jpg", {
    type: "image/jpeg",
    lastModified: nov25Ms,
  });

  return [jpgFile, pdfFile, spoofFile];
}
