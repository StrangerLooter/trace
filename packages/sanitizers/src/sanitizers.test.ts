import { describe, expect, it } from "vitest";
import { zipSync } from "@trace/parsers";
import {
  createSanitizedZipBundle,
  getSanitizationCapabilities,
  sanitizeJpegBytes,
  sanitizeLocalFile,
  sanitizePngBytes,
} from "./index";

function ascii(s: string): number[] {
  return Array.from(s).map((c) => c.charCodeAt(0));
}

function u32be(v: number): number[] {
  return [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
}

describe("@trace/sanitizers", () => {
  it("strips selected JPEG COM/APP1 segments losslessly and verifies removal", async () => {
    const comment = "Author: Secret";
    const comLen = 2 + comment.length;
    const sofPayload = [8, 0x01, 0x00, 0x01, 0x00, 3];
    const sofLen = 2 + sofPayload.length;
    const fakeApp1 = [...ascii("Exif\0\0MM\0*")];
    const app1Len = 2 + fakeApp1.length;

    const jpeg = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xe1, (app1Len >> 8) & 0xff, app1Len & 0xff, ...fakeApp1,
      0xff, 0xfe, (comLen >> 8) & 0xff, comLen & 0xff, ...ascii(comment),
      0xff, 0xc0, (sofLen >> 8) & 0xff, sofLen & 0xff, ...sofPayload,
      0xff, 0xda, 0x00, 0x04, 0x11, 0x22,
      0xff, 0xd9,
    ]);

    const res = await sanitizeJpegBytes(jpeg, "vacation.jpg", ["exif_gps", "comments"]);
    expect(res.overallStatus).toBe("removed_and_verified");
    expect(res.suggestedFilename).toBe("vacation.clean.jpg");
    expect(res.removedFieldNames).toContain("JPEG Comment");
    // Image dimensions from SOF0 and SOS/EOI remain intact
    expect(res.remainingFieldNames).toContain("Image Width");
    expect(res.outputBytes.byteLength).toBeLessThan(jpeg.byteLength);
  });

  it("strips PNG tEXt and tIME chunks while preserving IHDR, IDAT, and IEND", async () => {
    const mkChunk = (type: string, data: number[]) => [
      ...u32be(data.length),
      ...ascii(type),
      ...data,
      0, 0, 0, 0,
    ];
    const ihdr = [...u32be(16), ...u32be(16), 8, 2, 0, 0, 0];
    const txt = [...ascii("Author"), 0, ...ascii("Alice")];
    const time = [0x07, 0xea, 11, 25, 12, 0, 0];
    const idat = [0x78, 0x9c, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01];

    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ...mkChunk("IHDR", ihdr),
      ...mkChunk("tEXt", txt),
      ...mkChunk("tIME", time),
      ...mkChunk("IDAT", idat),
      ...mkChunk("IEND", []),
    ]);

    const res = await sanitizePngBytes(png, "shot.png", ["png_text", "png_time"]);
    expect(res.overallStatus).toBe("removed_and_verified");
    expect(res.removedFieldNames).toContain("Author");
    expect(res.removedFieldNames).toContain("Last Modified Time");
    expect(res.remainingFieldNames).toContain("Image Width");
    expect(new TextDecoder("latin1").decode(res.outputBytes)).toContain("IDAT");
  });

  it("refuses unsupported formats honestly instead of faking cleanup", async () => {
    const caps = getSanitizationCapabilities("pe");
    expect(caps.supported).toBe(false);

    const res = await sanitizeLocalFile(new Blob([new Uint8Array(16)]), "app.exe", "pe", ["exif_gps"]);
    expect(res.overallStatus).toBe("unsupported_metadata");
    expect(res.outputBytes.byteLength).toBe(0);
  });

  it("strips WebP EXIF chunks, MP3 ID3v2 headers, WAV LIST INFO chunks, and DOCX docProps cleanly", async () => {
    const u32le = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];

    // 1. WebP with EXIF chunk
    const exifBody = ascii("Exif\0\0MM\0*");
    const vp8Body = [0, 0, 0, 0];
    const webp = new Uint8Array([
      ...ascii("RIFF"), ...u32le(4 + 8 + exifBody.length + 8 + vp8Body.length), ...ascii("WEBP"),
      ...ascii("EXIF"), ...u32le(exifBody.length), ...exifBody,
      ...ascii("VP8 "), ...u32le(vp8Body.length), ...vp8Body,
    ]);
    const webpRes = await sanitizeLocalFile(new Blob([webp]), "pic.webp", "webp", ["webp_metadata"]);
    expect(webpRes.overallStatus).toBe("removed_and_verified");
    expect(new TextDecoder("latin1").decode(webpRes.outputBytes)).not.toContain("EXIF");

    // 2. MP3 with ID3v2
    const framePayload = [0x03, ...ascii("Secret Artist")];
    const mp3 = new Uint8Array([
      ...ascii("ID3"), 3, 0, 0, 0, 0, 0, 10 + framePayload.length,
      ...ascii("TPE1"), ...u32be(framePayload.length), 0, 0, ...framePayload,
      0xff, 0xfb, 0x90, 0x00,
    ]);
    const mp3Res = await sanitizeLocalFile(new Blob([mp3]), "song.mp3", "mp3", ["mp3_id3"]);
    expect(mp3Res.overallStatus).toBe("removed_and_verified");
    expect(mp3Res.outputBytes[0]).toBe(0xff);

    // 3. WAV with LIST/INFO
    const fmt = [1, 0, 2, 0, ...u32le(48000), ...u32le(192000), 4, 0, 16, 0];
    const listInfo = [...ascii("INFO"), ...ascii("IART"), ...u32le(4), ...ascii("Bob\0")];
    const wav = new Uint8Array([
      ...ascii("RIFF"), ...u32le(4 + 8 + fmt.length + 8 + listInfo.length), ...ascii("WAVE"),
      ...ascii("fmt "), ...u32le(fmt.length), ...fmt,
      ...ascii("LIST"), ...u32le(listInfo.length), ...listInfo,
    ]);
    const wavRes = await sanitizeLocalFile(new Blob([wav]), "clip.wav", "wav", ["wav_chunks"]);
    expect(wavRes.overallStatus).toBe("removed_and_verified");
    expect(wavRes.removedFieldNames).toContain("Artist");

    // 4. DOCX with docProps/core.xml
    const docx = zipSync({
      "word/document.xml": new Uint8Array(ascii("<w:document/>")),
      "docProps/core.xml": new Uint8Array(ascii('<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>Ram</dc:creator></cp:coreProperties>')),
    });
    const docxRes = await sanitizeLocalFile(new Blob([docx.slice()]), "memo.docx", "docx", ["office_docprops"]);
    expect(docxRes.overallStatus).toBe("removed_and_verified");
    expect(docxRes.removedFieldNames).toContain("creator");

    // 5. Batch ZIP bundle
    const bundle = createSanitizedZipBundle([
      { filename: webpRes.suggestedFilename, bytes: webpRes.outputBytes },
      { filename: mp3Res.suggestedFilename, bytes: mp3Res.outputBytes },
    ]);
    expect(bundle.byteLength).toBeGreaterThan(22);
    expect(bundle[0]).toBe(0x50);
    expect(bundle[1]).toBe(0x4b);
  });
});
