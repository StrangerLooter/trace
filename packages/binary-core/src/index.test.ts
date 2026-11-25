import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  BinaryCursor,
  BlobBinaryReader,
  BufferBinaryReader,
  formatHex,
  ReadLimitExceededError,
  streamSha256,
  TruncatedReadError,
} from "./index";

describe("binary-core", () => {
  it("reads bounded slices from BufferBinaryReader and BlobBinaryReader identically", async () => {
    const raw = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const bufReader = new BufferBinaryReader(raw);
    const blobReader = new BlobBinaryReader(new Blob([raw]));

    expect(bufReader.byteLength).toBe(8);
    expect(blobReader.byteLength).toBe(8);

    expect(await bufReader.read(2, 4)).toEqual(new Uint8Array([0x4e, 0x47, 0x0d, 0x0a]));
    expect(await blobReader.read(2, 4)).toEqual(new Uint8Array([0x4e, 0x47, 0x0d, 0x0a]));

    // Clamps cleanly past EOF
    expect(await bufReader.read(6, 10)).toEqual(new Uint8Array([0x1a, 0x0a]));
    expect(await blobReader.read(6, 10)).toEqual(new Uint8Array([0x1a, 0x0a]));

    // Throws TruncatedReadError on readExact past EOF
    await expect(bufReader.readExact(6, 4)).rejects.toThrow(TruncatedReadError);
    await expect(blobReader.readExact(6, 4)).rejects.toThrow(TruncatedReadError);
  });

  it("enforces maxSliceBytes cap and supports sub-reader slicing", async () => {
    const raw = new Uint8Array(64).map((_, i) => i);
    const reader = new BufferBinaryReader(raw, 16);

    await expect(reader.read(0, 32)).rejects.toThrow(ReadLimitExceededError);

    const sub = reader.sliceReader(10, 8);
    expect(sub.byteLength).toBe(8);
    expect(await sub.read(0, 4)).toEqual(new Uint8Array([10, 11, 12, 13]));
  });

  it("decodes endian integers via BinaryCursor and guards bounds", () => {
    const buf = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x41, 0x42]);
    const cursor = new BinaryCursor(buf);

    expect(cursor.readU16(false)).toBe(0x0102);
    expect(cursor.readU16(true)).toBe(0x0403);
    expect(cursor.readAscii(2)).toBe("AB");
    expect(cursor.remaining).toBe(0);
    expect(() => cursor.readU8()).toThrow(TruncatedReadError);
    expect(formatHex(buf.subarray(0, 3))).toBe("01 02 03");
  });

  it("computes streaming SHA-256 matching node:crypto across chunks and empty input", async () => {
    const emptyReader = new BufferBinaryReader(new Uint8Array(0));
    const emptyExpected = createHash("sha256").update(Buffer.alloc(0)).digest("hex");
    expect(await streamSha256(emptyReader)).toBe(emptyExpected);

    const payload = new Uint8Array(100).map((_, i) => (i * 17) & 0xff);
    const expected = createHash("sha256").update(payload).digest("hex");

    const progresses: number[] = [];
    const digest = await streamSha256(new BufferBinaryReader(payload), {
      chunkSizeBytes: 13,
      onProgress: (p) => progresses.push(p.bytesProcessed),
    });

    expect(digest).toBe(expected);
    expect(progresses.at(-1)).toBe(100);
  });

  it("aborts streaming SHA-256 cleanly when AbortSignal fires", async () => {
    const controller = new AbortController();
    controller.abort();
    const reader = new BufferBinaryReader(new Uint8Array(32));
    await expect(
      streamSha256(reader, { signal: controller.signal })
    ).rejects.toThrow("Binary read aborted");
  });
});
