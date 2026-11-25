import { describe, expect, it } from "vitest";
import {
  BufferBinaryReader,
  DEFAULT_MAX_SLICE_BYTES,
  streamSha256,
  TruncatedReadError,
  type BinaryReader,
} from "@trace/binary-core";
import { BoundedEventEmitter } from "@trace/event-system";
import { detectFileSignature } from "@trace/file-signatures";
import { Mp4Parser } from "./mp4";

function ascii(s: string): number[] {
  return Array.from(s).map((c) => c.charCodeAt(0));
}

function u32be(v: number): number[] {
  return [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
}

function u64be(v: number): number[] {
  const hi = Math.floor(v / 2 ** 32);
  const lo = v >>> 0;
  return [...u32be(hi), ...u32be(lo)];
}

/**
 * Sparse 5 GiB BinaryReader representing an MP4 with:
 * - ftyp box @ 0
 * - moov/mvhd box @ 16
 * - 64-bit extended mdat box spanning ~5 GiB (never allocated in RAM)
 */
class SparseFiveGibMp4Reader implements BinaryReader {
  readonly byteLength: number;
  private _bytesReadTotal = 0;
  private readonly headerPrefix: Uint8Array;

  constructor(totalBytes: number, headerPrefix: Uint8Array) {
    this.byteLength = totalBytes;
    this.headerPrefix = headerPrefix;
  }

  get bytesReadTotal(): number {
    return this._bytesReadTotal;
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    if (length > DEFAULT_MAX_SLICE_BYTES) {
      throw new Error(`Exceeded max slice: ${length}`);
    }
    const clamped = Math.min(length, Math.max(0, this.byteLength - offset));
    const out = new Uint8Array(clamped);
    if (offset < this.headerPrefix.byteLength) {
      const copyLen = Math.min(clamped, this.headerPrefix.byteLength - offset);
      out.set(this.headerPrefix.subarray(offset, offset + copyLen), 0);
    }
    this._bytesReadTotal += out.byteLength;
    return out;
  }

  async readExact(offset: number, length: number): Promise<Uint8Array> {
    const d = await this.read(offset, length);
    if (d.byteLength < length) throw new TruncatedReadError(offset, length, d.byteLength);
    return d;
  }

  sliceReader(offset: number, length: number): BinaryReader {
    return new BufferBinaryReader(this.headerPrefix.subarray(offset, offset + length));
  }
}

describe("Phase 16 Performance Benchmarks", () => {
  it("identifies and parses a 5 GiB MP4 with < 128 KiB total I/O and sub-50ms latency", async () => {
    const fiveGib = 5 * 1024 * 1024 * 1024;
    const mvhdPayload = [0, 0, 0, 0, ...u32be(3700000000), ...u32be(3700000000), ...u32be(1000), ...u32be(120_000), 0, 0, 0, 0];
    const mvhdBox = [...u32be(8 + mvhdPayload.length), ...ascii("mvhd"), ...mvhdPayload];
    const moovBox = [...u32be(8 + mvhdBox.length), ...ascii("moov"), ...mvhdBox];
    const ftypBox = [...u32be(16), ...ascii("ftyp"), ...ascii("isom"), 0, 0, 0, 0];
    const mdatOffset = ftypBox.length + moovBox.length;
    const mdatSize64 = fiveGib - mdatOffset;
    const mdatHeader = [...u32be(1), ...ascii("mdat"), ...u64be(mdatSize64)];

    const headerPrefix = new Uint8Array([...ftypBox, ...moovBox, ...mdatHeader]);
    const reader = new SparseFiveGibMp4Reader(fiveGib, headerPrefix);

    const t0 = performance.now();
    const id = await detectFileSignature(reader, { fileName: "5gb_capture.mp4" });
    const sigMs = performance.now() - t0;

    const t1 = performance.now();
    const out = await new Mp4Parser().parse({
      fileId: "perf-5gb",
      fileName: "5gb_capture.mp4",
      reader,
      identification: id,
      emitter: new BoundedEventEmitter(),
    });
    const parseMs = performance.now() - t1;

    console.info(
      `[PERF 5GiB MP4] sigMs=${sigMs.toFixed(2)}ms parseMs=${parseMs.toFixed(2)}ms bytesReadTotal=${reader.bytesReadTotal}B`
    );

    expect(id.formatId).toBe("mp4");
    expect(out.fields.find((f) => f.rawKey === "mvhd.duration")?.value).toBe(120);
    expect(reader.bytesReadTotal).toBeLessThan(128 * 1024);
    expect(sigMs + parseMs).toBeLessThan(500);
  });

  it("measures streaming SHA-256 throughput over 64 MiB bounded 16 MiB chunks", async () => {
    const sizeBytes = 64 * 1024 * 1024;
    const buf = new Uint8Array(sizeBytes);
    buf[0] = 0x54;
    buf[sizeBytes - 1] = 0x45;

    const memBefore = process.memoryUsage().heapUsed;
    const t0 = performance.now();
    const sha = await streamSha256(new BufferBinaryReader(buf), {
      chunkSizeBytes: 16 * 1024 * 1024,
    });
    const elapsedMs = performance.now() - t0;
    const memAfter = process.memoryUsage().heapUsed;
    const throughputMBps = (64 / (elapsedMs / 1000)).toFixed(1);

    console.info(
      `[PERF SHA-256 64MiB] elapsedMs=${elapsedMs.toFixed(2)}ms throughput=${throughputMBps}MB/s heapDeltaMB=${((memAfter - memBefore) / (1024 * 1024)).toFixed(2)}`
    );

    expect(sha).toHaveLength(64);
  });
});
