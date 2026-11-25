import { describe, expect, it } from "vitest";
import { BufferBinaryReader } from "@trace/binary-core";
import { BoundedEventEmitter } from "@trace/event-system";
import { detectFileSignature } from "@trace/file-signatures";
import { createDefaultParserRegistry } from "./index";

function ascii(s: string): number[] {
  return Array.from(s).map((c) => c.charCodeAt(0));
}

function u32be(v: number): number[] {
  return [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
}

function u32le(v: number): number[] {
  return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
}

function u16le(v: number): number[] {
  return [v & 0xff, (v >>> 8) & 0xff];
}

async function runParse(bytes: Uint8Array, fileName: string) {
  const reader = new BufferBinaryReader(bytes);
  const id = await detectFileSignature(reader, { fileName });
  const registry = createDefaultParserRegistry();
  const parser = registry.getAll().find((p) => p.canParse(id));
  expect(parser).toBeDefined();
  return parser!.parse({
    fileId: "test-file",
    fileName,
    reader,
    identification: id,
    emitter: new BoundedEventEmitter(),
  });
}

describe("@trace/parsers", () => {
  it("parses JPEG SOF0 dimensions, COM comment with exact byteRange, and detects trailing bytes past EOI", async () => {
    const comText = "Captured by Studio";
    const comLen = 2 + comText.length;
    const sofPayload = [8, 0x04, 0x38, 0x07, 0x80, 3]; // 8-bit, 1080x1920
    const sofLen = 2 + sofPayload.length;
    const bytes = new Uint8Array([
      0xff, 0xd8, // SOI
      0xff, 0xfe, (comLen >> 8) & 0xff, comLen & 0xff, ...ascii(comText), // COM
      0xff, 0xc0, (sofLen >> 8) & 0xff, sofLen & 0xff, ...sofPayload, // SOF0
      0xff, 0xd9, // EOI
      0xaa, 0xbb, 0xcc, // trailing bytes
    ]);

    const out = await runParse(bytes, "photo.jpg");
    const width = out.fields.find((f) => f.rawKey === "SOF.SamplesPerLine");
    const com = out.fields.find((f) => f.rawKey === "COM");
    expect(width?.value).toBe(1920);
    expect(com?.value).toBe(comText);
    expect(com?.byteRange).toEqual({ start: 6, length: comText.length });
    expect(out.findings.some((f) => f.ruleId === "rule-jpeg-trailing-bytes")).toBe(true);
  });

  it("parses PNG IHDR, tEXt, and detects trailing bytes past IEND", async () => {
    const ihdrData = [...u32be(800), ...u32be(600), 8, 6, 0, 0, 0];
    const textData = [...ascii("Software"), 0, ...ascii("GIMP 2.10")];
    const mkChunk = (type: string, data: number[]) => [
      ...u32be(data.length),
      ...ascii(type),
      ...data,
      0, 0, 0, 0,
    ];
    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ...mkChunk("IHDR", ihdrData),
      ...mkChunk("tEXt", textData),
      ...mkChunk("IEND", []),
      0xde, 0xad,
    ]);

    const out = await runParse(bytes, "img.png");
    expect(out.fields.find((f) => f.rawKey === "IHDR.Width")?.value).toBe(800);
    expect(out.fields.find((f) => f.rawKey === "tEXt.Software")?.value).toBe("GIMP 2.10");
    expect(out.findings.some((f) => f.ruleId === "rule-png-trailing-bytes")).toBe(true);
  });

  it("guards against circular TIFF IFD pointer loops", async () => {
    // Little-endian TIFF with IFD0 at offset 8 pointing back to 8
    const bytes = new Uint8Array([
      0x49, 0x49, 0x2a, 0x00, ...u32le(8),
      0x00, 0x00, ...u32le(8),
    ]);
    const out = await runParse(bytes, "loop.tiff");
    expect(out.findings.some((f) => f.ruleId === "rule-tiff-ifd-cycle")).toBe(true);
  });

  it("parses MP3 ID3v2 frames and WAV fmt/LIST INFO chunks", async () => {
    const framePayload = [0x03, ...ascii("Test Track")];
    const tagBodySize = 10 + framePayload.length;
    const mp3Bytes = new Uint8Array([
      ...ascii("ID3"), 3, 0, 0, 0, 0, 0, tagBodySize,
      ...ascii("TIT2"), ...u32be(framePayload.length), 0, 0, ...framePayload,
      0xff, 0xfb, 0x90, 0x00,
    ]);
    const mp3Out = await runParse(mp3Bytes, "track.mp3");
    expect(mp3Out.fields.find((f) => f.rawKey === "ID3.TIT2")?.value).toBe("Test Track");

    const fmtData = [...u16le(1), ...u16le(2), ...u32le(48000), ...u32le(192000), ...u16le(4), ...u16le(16)];
    const infoTag = [...ascii("IART"), ...u32le(6), ...ascii("Alice\0")];
    const listData = [...ascii("INFO"), ...infoTag];
    const wavBytes = new Uint8Array([
      ...ascii("RIFF"), ...u32le(4 + 8 + fmtData.length + 8 + listData.length), ...ascii("WAVE"),
      ...ascii("fmt "), ...u32le(fmtData.length), ...fmtData,
      ...ascii("LIST"), ...u32le(listData.length), ...listData,
    ]);
    const wavOut = await runParse(wavBytes, "sound.wav");
    expect(wavOut.fields.find((f) => f.rawKey === "fmt.nSamplesPerSec")?.value).toBe(48000);
    expect(wavOut.fields.find((f) => f.rawKey === "LIST.INFO.IART")?.value).toBe("Alice");
  });

  it("walks MP4 ftyp/moov/mvhd boxes while skipping mdat", async () => {
    const mvhdPayload = [
      0, 0, 0, 0,
      ...u32be(3700000000), // creation_time
      ...u32be(3700000000),
      ...u32be(1000), // timescale
      ...u32be(5500), // duration = 5.5s
      0, 0, 0, 0,
    ];
    const mvhdBox = [...u32be(8 + mvhdPayload.length), ...ascii("mvhd"), ...mvhdPayload];
    const moovBox = [...u32be(8 + mvhdBox.length), ...ascii("moov"), ...mvhdBox];
    const ftypBox = [...u32be(16), ...ascii("ftyp"), ...ascii("isom"), 0, 0, 0, 0];
    const mdatBox = [...u32be(16), ...ascii("mdat"), 1, 2, 3, 4, 5, 6, 7, 8];

    const mp4Bytes = new Uint8Array([...ftypBox, ...moovBox, ...mdatBox]);
    const out = await runParse(mp4Bytes, "video.mp4");
    expect(out.fields.find((f) => f.rawKey === "ftyp.major_brand")?.value).toBe("isom");
    expect(out.fields.find((f) => f.rawKey === "mvhd.duration")?.value).toBe(5.5);
    expect(out.coveragePatch.containerIndexInspected).toBe(true);
  });

  it("parses PDF Info dictionary, JavaScript indicators, and trailing bytes past %%EOF", async () => {
    const pdfText =
      "%PDF-1.7\n1 0 obj\n<< /Author (Jane Doe) /Producer (CustomTool) >>\nendobj\n" +
      "2 0 obj\n<< /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>\nendobj\n" +
      "%%EOF\nEXTRA_DATA";
    const out = await runParse(new Uint8Array(ascii(pdfText)), "sample.pdf");
    expect(out.fields.find((f) => f.rawKey === "Info.Author")?.value).toBe("Jane Doe");
    expect(out.fields.find((f) => f.rawKey === "PDF.JavaScript")?.value).toBe(true);
    expect(out.findings.some((f) => f.ruleId === "rule-pdf-active-actions")).toBe(true);
    expect(out.findings.some((f) => f.ruleId === "rule-pdf-trailing-bytes")).toBe(true);
  });

  it("inspects ZIP central directory, flags path traversal, and extracts DOCX core.xml safely", async () => {
    const coreXml =
      '<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>Alex Morgan</dc:creator></cp:coreProperties>';
    const wordEntryName = "word/document.xml";
    const coreEntryName = "docProps/core.xml";
    const evilEntryName = "../../etc/passwd";

    const mkLfh = (name: string, data: number[]) => [
      0x50, 0x4b, 0x03, 0x04, ...u16le(20), ...u16le(0), ...u16le(0), ...u16le(0), ...u16le(0),
      ...u32le(0), ...u32le(data.length), ...u32le(data.length), ...u16le(name.length), ...u16le(0),
      ...ascii(name), ...data,
    ];
    const lfh1 = mkLfh(wordEntryName, ascii("<w:document/>"));
    const lfh2Offset = lfh1.length;
    const lfh2 = mkLfh(coreEntryName, ascii(coreXml));
    const lfh3Offset = lfh2Offset + lfh2.length;
    const lfh3 = mkLfh(evilEntryName, ascii("x"));

    const mkCd = (name: string, dataLen: number, lfhOff: number) => [
      0x50, 0x4b, 0x01, 0x02, ...u16le(20), ...u16le(20), ...u16le(0), ...u16le(0), ...u16le(0), ...u16le(0),
      ...u32le(0), ...u32le(dataLen), ...u32le(dataLen), ...u16le(name.length), ...u16le(0), ...u16le(0),
      ...u16le(0), ...u16le(0), ...u32le(0), ...u32le(lfhOff), ...ascii(name),
    ];
    const cdOffset = lfh3Offset + lfh3.length;
    const cd = [
      ...mkCd(wordEntryName, 13, 0),
      ...mkCd(coreEntryName, coreXml.length, lfh2Offset),
      ...mkCd(evilEntryName, 1, lfh3Offset),
    ];
    const eocd = [
      0x50, 0x4b, 0x05, 0x06, ...u16le(0), ...u16le(0), ...u16le(3), ...u16le(3),
      ...u32le(cd.length), ...u32le(cdOffset), ...u16le(0),
    ];

    const zipBytes = new Uint8Array([...lfh1, ...lfh2, ...lfh3, ...cd, ...eocd]);
    const out = await runParse(zipBytes, "report.docx");
    expect(out.fields.find((f) => f.rawKey === "docProps/core.xml:creator")?.value).toBe("Alex Morgan");
    expect(out.findings.some((f) => f.ruleId === "rule-zip-path-traversal")).toBe(true);
  });

  it("parses PE COFF/Optional headers and ELF64 headers", async () => {
    const pe = new Uint8Array(256);
    pe[0] = 0x4d;
    pe[1] = 0x5a;
    const dv = new DataView(pe.buffer);
    dv.setUint32(0x3c, 0x80, true);
    pe.set([0x50, 0x45, 0x00, 0x00], 0x80);
    dv.setUint16(0x84, 0x8664, true); // AMD64
    dv.setUint16(0x86, 1, true); // 1 section
    dv.setUint16(0x94, 24, true); // optional header size
    dv.setUint16(0x98, 0x20b, true); // PE32+
    dv.setUint32(0xa8, 0x1000, true); // entry point

    const peOut = await runParse(pe, "app.exe");
    expect(peOut.fields.find((f) => f.rawKey === "PE.Machine")?.value).toBe("x86-64 (AMD64)");
    expect(peOut.fields.find((f) => f.rawKey === "PE.OptionalHeader.Magic")?.value).toBe("PE32+ (64-bit)");

    const elf = new Uint8Array(64);
    elf.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1], 0); // ELF64 LE
    const edv = new DataView(elf.buffer);
    edv.setUint16(16, 3, true); // ET_DYN
    edv.setUint16(18, 0x3e, true); // x86-64
    edv.setBigUint64(24, BigInt(0x401000), true);
    const elfOut = await runParse(elf, "daemon");
    expect(elfOut.fields.find((f) => f.rawKey === "ELF.e_machine")?.value).toBe("x86-64");
    expect(elfOut.fields.find((f) => f.rawKey === "ELF.e_entry")?.value).toBe("0x401000");
  });

  it("parses HEIC ISOBMFF ispe/irot boxes and embedded EXIF TIFF", async () => {
    const ispePayload = [0, 0, 0, 0, ...u32be(4032), ...u32be(3024)];
    const ispeBox = [...u32be(8 + ispePayload.length), ...ascii("ispe"), ...ispePayload];
    const irotBox = [...u32be(9), ...ascii("irot"), 1]; // 90 deg
    const ipcoBox = [...u32be(8 + ispeBox.length + irotBox.length), ...ascii("ipco"), ...ispeBox, ...irotBox];
    const iprpBox = [...u32be(8 + ipcoBox.length), ...ascii("iprp"), ...ipcoBox];
    const metaBox = [...u32be(12 + iprpBox.length), ...ascii("meta"), 0, 0, 0, 0, ...iprpBox];
    const ftypBox = [...u32be(16), ...ascii("ftyp"), ...ascii("heic"), 0, 0, 0, 0];

    // Minimal little-endian TIFF with Make ("Apple") inside an mdat/Exif block
    const makeStr = ascii("Apple\0");
    const ifdOffset = 8;
    const valOffset = ifdOffset + 2 + 12 + 4;
    const tiffBytes = [
      0x49, 0x49, 0x2a, 0x00, ...u32le(ifdOffset),
      ...u16le(1), // 1 tag
      ...u16le(0x010f), ...u16le(2), ...u32le(makeStr.length), ...u32le(valOffset),
      ...u32le(0),
      ...makeStr,
    ];
    const exifPayload = [...ascii("Exif\0\0"), ...tiffBytes];
    const mdatBox = [...u32be(8 + exifPayload.length), ...ascii("mdat"), ...exifPayload];

    const heicBytes = new Uint8Array([...ftypBox, ...metaBox, ...mdatBox]);
    const out = await runParse(heicBytes, "iphone_shot.heic");
    expect(out.fields.find((f) => f.rawKey === "ftyp.major_brand")?.value).toBe("heic");
    expect(out.fields.find((f) => f.rawKey === "ispe.dimensions")?.value).toBe("4032x3024");
    expect(out.fields.find((f) => f.rawKey === "irot.angle")?.value).toBe(90);
    expect(out.fields.find((f) => f.rawKey === "EXIF.Make")?.value).toBe("Apple");
  });

  it("parses WebM/MKV EBML header, Segment Info, Tracks, and skips Clusters cleanly", async () => {
    const ebmlEl = (idBytes: number[], payload: number[]) => [
      ...idBytes,
      0x80 | payload.length,
      ...payload,
    ];

    const docType = ebmlEl([0x42, 0x82], ascii("webm"));
    const ebmlHeader = ebmlEl([0x1a, 0x45, 0xdf, 0xa3], docType);

    const writingApp = ebmlEl([0x57, 0x41], ascii("OBS Studio 30"));
    const info = ebmlEl([0x15, 0x49, 0xa9, 0x66], writingApp);

    const codecId = ebmlEl([0x86], ascii("V_VP9"));
    const pxW = ebmlEl([0xb0], [0x07, 0x80]); // 1920
    const pxH = ebmlEl([0xba], [0x04, 0x38]); // 1080
    const videoEl = ebmlEl([0xe0], [...pxW, ...pxH]);
    const trackEntry = ebmlEl([0xae], [...codecId, ...videoEl]);
    const tracks = ebmlEl([0x16, 0x54, 0xae, 0x6b], trackEntry);

    const cluster = ebmlEl([0x1f, 0x43, 0xb6, 0x75], [1, 2, 3, 4]);
    const segment = ebmlEl([0x18, 0x53, 0x80, 0x67], [...info, ...tracks, ...cluster]);

    const webmBytes = new Uint8Array([...ebmlHeader, ...segment]);
    const out = await runParse(webmBytes, "screen_recording.webm");
    expect(out.fields.find((f) => f.rawKey === "EBML.DocType")?.value).toBe("webm");
    expect(out.fields.find((f) => f.rawKey === "Segment.Info.WritingApp")?.value).toBe("OBS Studio 30");
    expect(out.fields.find((f) => f.rawKey === "Tracks.TrackEntry.CodecID")?.value).toBe("V_VP9");
    expect(out.fields.find((f) => f.rawKey === "Tracks.Video.PixelWidth")?.value).toBe(1920);
    expect(out.fields.find((f) => f.rawKey === "Tracks.Video.PixelHeight")?.value).toBe(1080);
    expect(out.coveragePatch.containerIndexInspected).toBe(true);
  });

  it("parses SQLite 3 database header and 7z archive header", async () => {
    const sqlite = new Uint8Array(100);
    sqlite.set(ascii("SQLite format 3\0"), 0);
    const sdv = new DataView(sqlite.buffer);
    sdv.setUint16(16, 4096, false);
    sdv.setUint32(28, 12, false);
    sdv.setUint32(56, 1, false);
    sdv.setUint32(96, 3045000, false);
    const sqlOut = await runParse(sqlite, "store.db");
    expect(sqlOut.fields.find((f) => f.rawKey === "SQLite.PageSize")?.value).toBe(4096);
    expect(sqlOut.fields.find((f) => f.rawKey === "SQLite.TextEncoding")?.value).toBe("UTF-8");

    const sevenZ = new Uint8Array(32);
    sevenZ.set([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0x00, 0x04], 0);
    const zOut = await runParse(sevenZ, "backup.7z");
    expect(zOut.fields.find((f) => f.rawKey === "7z.Version")?.value).toBe("0.4");
  });
});
