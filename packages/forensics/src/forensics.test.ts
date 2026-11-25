import { describe, expect, it } from "vitest";
import { BufferBinaryReader } from "@trace/binary-core";
import { BoundedEventEmitter } from "@trace/event-system";
import { detectFileSignature } from "@trace/file-signatures";
import { createDefaultParserRegistry } from "@trace/parsers";
import type { MetadataField } from "@trace/shared-types";
import { evaluateForensicRules } from "./index";

function ascii(s: string): number[] {
  return Array.from(s).map((c) => c.charCodeAt(0));
}

describe("@trace/forensics", () => {
  it("reports zero findings on a clean JPEG with only image dimensions", async () => {
    const sofPayload = [8, 0x02, 0x00, 0x02, 0x00, 3];
    const cleanJpeg = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xc0, 0x00, 2 + sofPayload.length, ...sofPayload,
      0xff, 0xd9,
    ]);
    const reader = new BufferBinaryReader(cleanJpeg);
    const id = await detectFileSignature(reader, { fileName: "clean.jpg" });
    const parser = createDefaultParserRegistry().getAll().find((p) => p.canParse(id))!;
    const out = await parser.parse({
      fileId: "f-clean",
      fileName: "clean.jpg",
      reader,
      identification: id,
      emitter: new BoundedEventEmitter(),
    });

    const evalRes = evaluateForensicRules({
      fileId: "f-clean",
      fileSizeBytes: cleanJpeg.byteLength,
      identification: id,
      fields: out.fields,
      structures: out.structures,
      parserFindings: out.findings,
    });

    expect(evalRes.findings).toHaveLength(0);
    expect(evalRes.summary.highestSeverity).toBe("none");
  });

  it("detects privacy risks (GPS, serial, author, email, software) and timestamp order anomaly", async () => {
    const reader = new BufferBinaryReader(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
    const id = await detectFileSignature(reader, { fileName: "sensitive.jpg" });

    const fields: MetadataField[] = [
      {
        id: "1",
        fieldName: "GPSLatitude",
        rawKey: "GPSLatitude",
        value: 37.7749,
        displayValue: "37.7749",
        dataType: "number",
        group: "gps",
        sourceParser: "exifr",
        confidence: "confirmed",
        isSensitive: true,
        status: "valid",
      },
      {
        id: "2",
        fieldName: "BodySerialNumber",
        rawKey: "BodySerialNumber",
        value: "SN-99421",
        displayValue: "SN-99421",
        dataType: "string",
        group: "camera",
        sourceParser: "exifr",
        confidence: "confirmed",
        isSensitive: true,
        status: "valid",
      },
      {
        id: "3",
        fieldName: "Artist",
        rawKey: "Artist",
        value: "Jane Doe <jane@example.com>",
        displayValue: "Jane Doe <jane@example.com>",
        dataType: "string",
        group: "exif",
        sourceParser: "exifr",
        confidence: "confirmed",
        isSensitive: true,
        status: "valid",
      },
      {
        id: "4",
        fieldName: "Software",
        rawKey: "Software",
        value: "Adobe Lightroom 7.0",
        displayValue: "Adobe Lightroom 7.0",
        dataType: "string",
        group: "exif",
        sourceParser: "exifr",
        confidence: "confirmed",
        isSensitive: true,
        status: "valid",
      },
      {
        id: "5",
        fieldName: "DateTimeOriginal",
        rawKey: "DateTimeOriginal",
        value: "2026:05:10 12:00:00",
        displayValue: "2026:05:10 12:00:00",
        dataType: "date",
        group: "exif",
        sourceParser: "exifr",
        confidence: "confirmed",
        isSensitive: true,
        status: "valid",
      },
      {
        id: "6",
        fieldName: "ModifyDate",
        rawKey: "ModifyDate",
        value: "2025:01:01 00:00:00",
        displayValue: "2025:01:01 00:00:00",
        dataType: "date",
        group: "exif",
        sourceParser: "exifr",
        confidence: "confirmed",
        isSensitive: true,
        status: "valid",
      },
    ];

    const res = evaluateForensicRules({
      fileId: "f-priv",
      fileSizeBytes: 4096,
      identification: id,
      fields,
      structures: [],
      parserFindings: [],
    });

    const rules = res.findings.map((f) => f.ruleId);
    expect(rules).toContain("rule-privacy-gps-coordinates");
    expect(rules).toContain("rule-privacy-device-serial");
    expect(rules).toContain("rule-privacy-author-identity");
    expect(rules).toContain("rule-privacy-email-address");
    expect(rules).toContain("rule-privacy-software-fingerprint");
    expect(rules).toContain("rule-integrity-timestamp-order");
    expect(res.summary.highestSeverity).toBe("high");
  });

  it("handles renamed PE disguised as PDF and trailing JPEG bytes without calling them steganography or malware", async () => {
    // 1. Renamed PE disguised as .pdf with zeroed timestamp & overlay
    const pe = new Uint8Array(256);
    pe[0] = 0x4d;
    pe[1] = 0x5a;
    const dv = new DataView(pe.buffer);
    dv.setUint32(0x3c, 0x80, true);
    pe.set([0x50, 0x45, 0x00, 0x00], 0x80);
    dv.setUint16(0x84, 0x8664, true);
    dv.setUint16(0x86, 1, true); // 1 section
    dv.setUint16(0x94, 24, true); // opt header size
    const secTable = 0x80 + 24 + 24;
    dv.setUint32(secTable + 16, 16, true); // rawSize = 16
    dv.setUint32(secTable + 20, 200, true); // rawPtr = 200 -> ends at 216, leaving 40B overlay

    const peReader = new BufferBinaryReader(pe);
    const peId = await detectFileSignature(peReader, { fileName: "invoice.pdf" });
    const peParser = createDefaultParserRegistry().getAll().find((p) => p.canParse(peId))!;
    const peOut = await peParser.parse({
      fileId: "f-pe",
      fileName: "invoice.pdf",
      reader: peReader,
      identification: peId,
      emitter: new BoundedEventEmitter(),
    });
    const peEval = evaluateForensicRules({
      fileId: "f-pe",
      fileSizeBytes: pe.byteLength,
      identification: peId,
      fields: peOut.fields,
      structures: peOut.structures,
      parserFindings: peOut.findings,
    });
    expect(peEval.findings.some((f) => f.ruleId === "rule-extension-mismatch")).toBe(true);
    expect(peEval.findings.some((f) => f.ruleId === "rule-pe-zero-timestamp")).toBe(true);
    expect(peEval.findings.some((f) => f.ruleId === "rule-pe-overlay-present")).toBe(true);

    // 2. JPEG trailing bytes wording check
    const trailingJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9, ...ascii("TRAILING")]);
    const jpgReader = new BufferBinaryReader(trailingJpeg);
    const jpgId = await detectFileSignature(jpgReader, { fileName: "tail.jpg" });
    const jpgParser = createDefaultParserRegistry().getAll().find((p) => p.canParse(jpgId))!;
    const jpgOut = await jpgParser.parse({
      fileId: "f-tail",
      fileName: "tail.jpg",
      reader: jpgReader,
      identification: jpgId,
      emitter: new BoundedEventEmitter(),
    });
    const jpgEval = evaluateForensicRules({
      fileId: "f-tail",
      fileSizeBytes: trailingJpeg.byteLength,
      identification: jpgId,
      fields: jpgOut.fields,
      structures: jpgOut.structures,
      parserFindings: jpgOut.findings,
    });
    const tailFinding = jpgEval.findings.find((f) => f.ruleId === "rule-jpeg-trailing-bytes");
    expect(tailFinding).toBeDefined();
    expect(tailFinding!.title.toLowerCase()).not.toContain("steganography");
    expect(tailFinding!.title.toLowerCase()).not.toContain("malware");
  });

  it("flags OS vs embedded capture transfer lag and WhatsApp messenger stripping", async () => {
    const reader = new BufferBinaryReader(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
    const id = await detectFileSignature(reader, { fileName: "WhatsApp Image 2024-11-25 at 10.15.00.jpeg" });
    const fields: MetadataField[] = [
      {
        id: "dt-orig",
        fieldName: "DateTimeOriginal",
        rawKey: "DateTimeOriginal",
        value: "2024:11:22 14:30:00",
        displayValue: "2024:11:22 14:30:00",
        dataType: "date",
        group: "exif",
        sourceParser: "exifr",
        confidence: "confirmed",
        isSensitive: true,
        status: "valid",
      },
    ];
    const evalRes = evaluateForensicRules({
      fileId: "wa-check",
      fileName: "WhatsApp Image 2024-11-25 at 10.15.00.jpeg",
      fileSizeBytes: 24000,
      fileLastModifiedMs: Date.UTC(2024, 10, 25, 10, 15, 0),
      identification: id,
      fields,
      structures: [],
      parserFindings: [],
    });
    expect(evalRes.findings.some((f) => f.ruleId === "rule-integrity-transfer-lag")).toBe(true);
    expect(evalRes.findings.some((f) => f.ruleId === "rule-messenger-stripping-indicator")).toBe(true);
  });
});
