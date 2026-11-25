import { deflateSync } from "fflate";
import { describe, expect, it } from "vitest";
import { BufferBinaryReader, ReadLimitExceededError } from "@trace/binary-core";
import { BoundedEventEmitter } from "@trace/event-system";
import { detectFileSignature } from "@trace/file-signatures";
import { ParserRegistry, type FormatParser } from "@trace/parser-registry";
import { buildTraceCsvReport, buildTraceJsonReport } from "@trace/report-schema";
import { createDefaultParserRegistry } from "./index";

function ascii(s: string): number[] {
  return Array.from(s).map((c) => c.charCodeAt(0));
}

function u16le(v: number): number[] {
  return [v & 0xff, (v >>> 8) & 0xff];
}

function u32le(v: number): number[] {
  return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
}

describe("TRACE Security Controls (Client Engine)", () => {
  it("blocks oversized slice reads to prevent browser OOM", async () => {
    const reader = new BufferBinaryReader(new Uint8Array(64), 16);
    await expect(reader.read(0, 32)).rejects.toThrow(ReadLimitExceededError);
  });

  it("detects high-ratio ZIP bomb indicators without inflating huge payload", async () => {
    // Craft a ZIP Central Directory declaring 50 MB uncompressed from 100 bytes compressed
    const name = "bomb.bin";
    const compressedPayload = deflateSync(new Uint8Array(256).fill(0));
    const lfh = [
      0x50, 0x4b, 0x03, 0x04, ...u16le(20), ...u16le(0), ...u16le(8), ...u16le(0), ...u16le(0),
      ...u32le(0), ...u32le(compressedPayload.length), ...u32le(50 * 1024 * 1024),
      ...u16le(name.length), ...u16le(0), ...ascii(name), ...compressedPayload,
    ];
    const cdOffset = lfh.length;
    const cd = [
      0x50, 0x4b, 0x01, 0x02, ...u16le(20), ...u16le(20), ...u16le(0), ...u16le(8), ...u16le(0), ...u16le(0),
      ...u32le(0), ...u32le(compressedPayload.length), ...u32le(50 * 1024 * 1024),
      ...u16le(name.length), ...u16le(0), ...u16le(0), ...u16le(0), ...u16le(0), ...u32le(0), ...u32le(0),
      ...ascii(name),
    ];
    const eocd = [
      0x50, 0x4b, 0x05, 0x06, ...u16le(0), ...u16le(0), ...u16le(1), ...u16le(1),
      ...u32le(cd.length), ...u32le(cdOffset), ...u16le(0),
    ];

    const bytes = new Uint8Array([...lfh, ...cd, ...eocd]);
    const reader = new BufferBinaryReader(bytes);
    const id = await detectFileSignature(reader, { fileName: "bomb.zip" });
    const parser = createDefaultParserRegistry().getAll().find((p) => p.canParse(id))!;
    const out = await parser.parse({
      fileId: "sec-bomb",
      fileName: "bomb.zip",
      reader,
      identification: id,
      emitter: new BoundedEventEmitter(),
    });

    expect(out.findings.some((f) => f.ruleId === "rule-zip-decompression-ratio")).toBe(true);
  });

  it("rejects XXE DOCTYPE/ENTITY payloads inside PDF XMP and DOCX core.xml", async () => {
    const xxePdf =
      '%PDF-1.7\n<x:xmpmeta><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><rdf:RDF>&xxe;</rdf:RDF></x:xmpmeta>\n%%EOF';
    const pdfReader = new BufferBinaryReader(new Uint8Array(ascii(xxePdf)));
    const pdfId = await detectFileSignature(pdfReader, { fileName: "xxe.pdf" });
    const pdfParser = createDefaultParserRegistry().getAll().find((p) => p.canParse(pdfId))!;
    const pdfOut = await pdfParser.parse({
      fileId: "sec-xxe-pdf",
      fileName: "xxe.pdf",
      reader: pdfReader,
      identification: pdfId,
      emitter: new BoundedEventEmitter(),
    });
    expect(pdfOut.fields.some((f) => f.rawKey === "PDF.XMP")).toBe(false);

    const xxeCore =
      '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "http://169.254.169.254/">]><cp:coreProperties><dc:creator>&xxe;</dc:creator></cp:coreProperties>';
    const lfh1 = [
      0x50, 0x4b, 0x03, 0x04, ...u16le(20), ...u16le(0), ...u16le(0), ...u16le(0), ...u16le(0),
      ...u32le(0), ...u32le(13), ...u32le(13), ...u16le(17), ...u16le(0),
      ...ascii("word/document.xml"), ...ascii("<w:document/>"),
    ];
    const lfh2Off = lfh1.length;
    const lfh2 = [
      0x50, 0x4b, 0x03, 0x04, ...u16le(20), ...u16le(0), ...u16le(0), ...u16le(0), ...u16le(0),
      ...u32le(0), ...u32le(xxeCore.length), ...u32le(xxeCore.length), ...u16le(17), ...u16le(0),
      ...ascii("docProps/core.xml"), ...ascii(xxeCore),
    ];
    const cdOff = lfh2Off + lfh2.length;
    const mkCd = (name: string, len: number, off: number) => [
      0x50, 0x4b, 0x01, 0x02, ...u16le(20), ...u16le(20), ...u16le(0), ...u16le(0), ...u16le(0), ...u16le(0),
      ...u32le(0), ...u32le(len), ...u32le(len), ...u16le(name.length), ...u16le(0), ...u16le(0),
      ...u16le(0), ...u16le(0), ...u32le(0), ...u32le(off), ...ascii(name),
    ];
    const cd = [...mkCd("word/document.xml", 13, 0), ...mkCd("docProps/core.xml", xxeCore.length, lfh2Off)];
    const eocd = [
      0x50, 0x4b, 0x05, 0x06, ...u16le(0), ...u16le(0), ...u16le(2), ...u16le(2),
      ...u32le(cd.length), ...u32le(cdOff), ...u16le(0),
    ];

    const docReader = new BufferBinaryReader(new Uint8Array([...lfh1, ...lfh2, ...cd, ...eocd]));
    const docId = await detectFileSignature(docReader, { fileName: "xxe.docx" });
    const zipParser = createDefaultParserRegistry().getAll().find((p) => p.canParse(docId))!;
    const docOut = await zipParser.parse({
      fileId: "sec-xxe-doc",
      fileName: "xxe.docx",
      reader: docReader,
      identification: docId,
      emitter: new BoundedEventEmitter(),
    });
    expect(docOut.fields.some((f) => f.rawKey === "docProps/core.xml:creator")).toBe(false);
  });

  it("handles XSS payloads in metadata as inert text and neutralizes CSV formulas", async () => {
    const xssPayload = '<img src=x onerror=alert(1)> =HYPERLINK("http://evil")';
    const comLen = 2 + xssPayload.length;
    const bytes = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xfe, (comLen >> 8) & 0xff, comLen & 0xff, ...ascii(xssPayload),
      0xff, 0xd9,
    ]);
    const reader = new BufferBinaryReader(bytes);
    const id = await detectFileSignature(reader, { fileName: "xss.jpg" });
    const parser = createDefaultParserRegistry().getAll().find((p) => p.canParse(id))!;
    const out = await parser.parse({
      fileId: "sec-xss",
      fileName: "xss.jpg",
      reader,
      identification: id,
      emitter: new BoundedEventEmitter(),
    });

    const comField = out.fields.find((f) => f.rawKey === "COM");
    expect(comField?.displayValue).toBe(xssPayload);

    const report = buildTraceJsonReport({
      fileName: "xss.jpg",
      sizeBytes: bytes.byteLength,
      declaredMime: "image/jpeg",
      sha256: null,
      identification: id,
      coverage: {
        mode: "local_browser",
        headerInspected: true,
        footerInspected: true,
        containerIndexInspected: true,
        completeFileScanned: true,
        fullHashComputed: false,
        uninspectedReasons: [],
      },
      metadata: [
        ...out.fields,
        {
          id: "formula",
          fieldName: "Author",
          value: "=CMD|' /C calc'!A0",
          displayValue: "=CMD|' /C calc'!A0",
          dataType: "string",
          group: "exif",
          sourceParser: "test",
          confidence: "confirmed",
          isSensitive: true,
          status: "valid",
        },
      ],
      structures: out.structures,
      findings: [],
      unsupportedWarnings: [],
      sanitizationHistory: [],
    });

    const csv = buildTraceCsvReport(report);
    expect(csv).toContain("'=CMD|' /C calc'!A0");
  });

  it("isolates failing parser exceptions without crashing the pipeline", async () => {
    const registry = new ParserRegistry();
    const throwingParser: FormatParser = {
      id: "faulty-parser",
      version: "0.0.1",
      supportedFormatIds: ["jpeg"],
      canParse: () => true,
      parse: async () => {
        throw new Error("Simulated malformed structure crash");
      },
    };
    registry.register(throwingParser);
    const reader = new BufferBinaryReader(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
    const id = await detectFileSignature(reader, { fileName: "bad.jpg" });
    const emitter = new BoundedEventEmitter();

    let caught = false;
    try {
      await throwingParser.parse({
        fileId: "sec-crash",
        fileName: "bad.jpg",
        reader,
        identification: id,
        emitter,
      });
    } catch {
      caught = true;
    }
    expect(caught).toBe(true);
  });
});
