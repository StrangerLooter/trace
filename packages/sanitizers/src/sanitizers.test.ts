import { describe, expect, it } from "vitest";
import {
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
});
