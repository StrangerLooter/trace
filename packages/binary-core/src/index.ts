import { createSHA256 } from "hash-wasm";
import type { ByteRange } from "@trace/shared-types";

export const DEFAULT_MAX_SLICE_BYTES = 16 * 1024 * 1024; // 16 MiB bounded window

export class TruncatedReadError extends Error {
  readonly offset: number;
  readonly requestedLength: number;
  readonly availableLength: number;

  constructor(offset: number, requestedLength: number, availableLength: number) {
    super(
      `Truncated read at offset 0x${offset.toString(16)}: requested ${requestedLength} bytes, available ${availableLength}`
    );
    this.name = "TruncatedReadError";
    this.offset = offset;
    this.requestedLength = requestedLength;
    this.availableLength = availableLength;
  }
}

export class ReadLimitExceededError extends Error {
  constructor(requestedLength: number, maxSliceBytes: number) {
    super(
      `Slice read of ${requestedLength} bytes exceeds bounded maximum (${maxSliceBytes} bytes)`
    );
    this.name = "ReadLimitExceededError";
  }
}

export interface BinaryReader {
  readonly byteLength: number;
  readonly bytesReadTotal: number;
  read(offset: number, length: number, signal?: AbortSignal): Promise<Uint8Array>;
  readExact(offset: number, length: number, signal?: AbortSignal): Promise<Uint8Array>;
  sliceReader(offset: number, length: number): BinaryReader;
}

function validateWindowArgs(offset: number, length: number, maxSliceBytes: number): void {
  if (!Number.isInteger(offset) || offset < 0) {
    throw new RangeError(`Invalid read offset: ${offset}`);
  }
  if (!Number.isInteger(length) || length < 0) {
    throw new RangeError(`Invalid read length: ${length}`);
  }
  if (length > maxSliceBytes) {
    throw new ReadLimitExceededError(length, maxSliceBytes);
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Binary read aborted", "AbortError");
  }
}

export class BufferBinaryReader implements BinaryReader {
  private readonly buffer: Uint8Array;
  private readonly maxSliceBytes: number;
  private _bytesReadTotal = 0;

  constructor(buffer: Uint8Array, maxSliceBytes = DEFAULT_MAX_SLICE_BYTES) {
    this.buffer = buffer;
    this.maxSliceBytes = maxSliceBytes;
  }

  get byteLength(): number {
    return this.buffer.byteLength;
  }

  get bytesReadTotal(): number {
    return this._bytesReadTotal;
  }

  async read(offset: number, length: number, signal?: AbortSignal): Promise<Uint8Array> {
    throwIfAborted(signal);
    validateWindowArgs(offset, length, this.maxSliceBytes);
    if (offset >= this.buffer.byteLength || length === 0) {
      return new Uint8Array(0);
    }
    const end = Math.min(offset + length, this.buffer.byteLength);
    const slice = this.buffer.slice(offset, end);
    this._bytesReadTotal += slice.byteLength;
    return slice;
  }

  async readExact(offset: number, length: number, signal?: AbortSignal): Promise<Uint8Array> {
    const data = await this.read(offset, length, signal);
    if (data.byteLength < length) {
      throw new TruncatedReadError(offset, length, data.byteLength);
    }
    return data;
  }

  sliceReader(offset: number, length: number): BinaryReader {
    validateWindowArgs(offset, length, Number.MAX_SAFE_INTEGER);
    const start = Math.min(offset, this.buffer.byteLength);
    const end = Math.min(start + length, this.buffer.byteLength);
    return new BufferBinaryReader(this.buffer.subarray(start, end), this.maxSliceBytes);
  }
}

export class BlobBinaryReader implements BinaryReader {
  private readonly blob: Blob;
  private readonly baseOffset: number;
  readonly byteLength: number;
  private readonly maxSliceBytes: number;
  private _bytesReadTotal = 0;

  constructor(
    blob: Blob,
    maxSliceBytes = DEFAULT_MAX_SLICE_BYTES,
    baseOffset = 0,
    boundedLength?: number
  ) {
    this.blob = blob;
    this.maxSliceBytes = maxSliceBytes;
    this.baseOffset = baseOffset;
    const remaining = Math.max(0, blob.size - baseOffset);
    this.byteLength = boundedLength === undefined ? remaining : Math.min(remaining, boundedLength);
  }

  get bytesReadTotal(): number {
    return this._bytesReadTotal;
  }

  async read(offset: number, length: number, signal?: AbortSignal): Promise<Uint8Array> {
    throwIfAborted(signal);
    validateWindowArgs(offset, length, this.maxSliceBytes);
    if (offset >= this.byteLength || length === 0) {
      return new Uint8Array(0);
    }
    const clampedLength = Math.min(length, this.byteLength - offset);
    const absStart = this.baseOffset + offset;
    const absEnd = absStart + clampedLength;
    const arrayBuffer = await this.blob.slice(absStart, absEnd).arrayBuffer();
    throwIfAborted(signal);
    const view = new Uint8Array(arrayBuffer);
    this._bytesReadTotal += view.byteLength;
    return view;
  }

  async readExact(offset: number, length: number, signal?: AbortSignal): Promise<Uint8Array> {
    const data = await this.read(offset, length, signal);
    if (data.byteLength < length) {
      throw new TruncatedReadError(offset, length, data.byteLength);
    }
    return data;
  }

  sliceReader(offset: number, length: number): BinaryReader {
    validateWindowArgs(offset, length, Number.MAX_SAFE_INTEGER);
    const start = Math.min(offset, this.byteLength);
    const clamped = Math.min(length, this.byteLength - start);
    return new BlobBinaryReader(
      this.blob,
      this.maxSliceBytes,
      this.baseOffset + start,
      clamped
    );
  }
}

export class BinaryCursor {
  private readonly data: Uint8Array;
  private readonly view: DataView;
  private offset = 0;

  constructor(data: Uint8Array) {
    this.data = data;
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  get position(): number {
    return this.offset;
  }

  get remaining(): number {
    return this.data.byteLength - this.offset;
  }

  seek(pos: number): void {
    if (pos < 0 || pos > this.data.byteLength) {
      throw new TruncatedReadError(pos, 0, this.data.byteLength);
    }
    this.offset = pos;
  }

  private ensure(bytes: number): void {
    if (this.offset + bytes > this.data.byteLength) {
      throw new TruncatedReadError(this.offset, bytes, this.remaining);
    }
  }

  readU8(): number {
    this.ensure(1);
    const val = this.view.getUint8(this.offset);
    this.offset += 1;
    return val;
  }

  readU16(littleEndian = false): number {
    this.ensure(2);
    const val = this.view.getUint16(this.offset, littleEndian);
    this.offset += 2;
    return val;
  }

  readU32(littleEndian = false): number {
    this.ensure(4);
    const val = this.view.getUint32(this.offset, littleEndian);
    this.offset += 4;
    return val;
  }

  readU64(littleEndian = false): bigint {
    this.ensure(8);
    const val = this.view.getBigUint64(this.offset, littleEndian);
    this.offset += 8;
    return val;
  }

  readBytes(length: number): Uint8Array {
    this.ensure(length);
    const slice = this.data.subarray(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }

  readAscii(length: number): string {
    const bytes = this.readBytes(length);
    let out = "";
    for (let i = 0; i < bytes.length; i++) {
      out += String.fromCharCode(bytes[i]);
    }
    return out;
  }
}

export function formatHex(bytes: Uint8Array, separator = " "): string {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    parts.push(bytes[i].toString(16).padStart(2, "0").toUpperCase());
  }
  return parts.join(separator);
}

export function clampRange(range: ByteRange, totalLength: number): ByteRange {
  const start = Math.max(0, Math.min(range.start, totalLength));
  const length = Math.max(0, Math.min(range.length, totalLength - start));
  return { start, length };
}

export interface StreamHashOptions {
  chunkSizeBytes?: number;
  signal?: AbortSignal;
  onProgress?: (progress: {
    bytesProcessed: number;
    totalBytes: number;
    percent: number;
  }) => void;
}

export async function streamSha256(
  reader: BinaryReader,
  options: StreamHashOptions = {}
): Promise<string> {
  const chunkSize = options.chunkSizeBytes ?? 16 * 1024 * 1024;
  if (chunkSize > DEFAULT_MAX_SLICE_BYTES) {
    throw new ReadLimitExceededError(chunkSize, DEFAULT_MAX_SLICE_BYTES);
  }

  const hasher = await createSHA256();
  hasher.init();

  const total = reader.byteLength;
  let offset = 0;

  while (offset < total) {
    throwIfAborted(options.signal);
    const readLen = Math.min(chunkSize, total - offset);
    const chunk = await reader.read(offset, readLen, options.signal);
    if (chunk.byteLength === 0) break;

    hasher.update(chunk);
    offset += chunk.byteLength;

    options.onProgress?.({
      bytesProcessed: offset,
      totalBytes: total,
      percent: total === 0 ? 100 : Math.min(100, (offset / total) * 100),
    });
  }

  if (total === 0) {
    options.onProgress?.({ bytesProcessed: 0, totalBytes: 0, percent: 100 });
  }

  return hasher.digest("hex");
}

/** Compute Shannon entropy in bits per byte (0.00 = uniform, 8.00 = maximally random/encrypted). */
export function computeShannonEntropy(bytes: Uint8Array): number {
  if (bytes.byteLength === 0) return 0;
  const counts = new Uint32Array(256);
  for (let i = 0; i < bytes.byteLength; i++) {
    counts[bytes[i]]++;
  }
  let entropy = 0;
  const len = bytes.byteLength;
  for (let i = 0; i < 256; i++) {
    const c = counts[i];
    if (c === 0) continue;
    const p = c / len;
    entropy -= p * Math.log2(p);
  }
  return Number(entropy.toFixed(2));
}

export interface ExtractedStringHit {
  offset: number;
  length: number;
  encoding: "ascii" | "utf16le";
  text: string;
}

/** Extract bounded printable ASCII and UTF-16LE strings with exact byte offsets. */
export function extractPrintableStrings(
  bytes: Uint8Array,
  baseOffset = 0,
  minLength = 6,
  maxHits = 200
): ExtractedStringHit[] {
  const hits: ExtractedStringHit[] = [];
  const isPrintable = (b: number) => (b >= 0x20 && b <= 0x7e) || b === 0x09;

  // 1. ASCII pass
  let start = -1;
  for (let i = 0; i <= bytes.byteLength && hits.length < maxHits; i++) {
    if (i < bytes.byteLength && isPrintable(bytes[i])) {
      if (start < 0) start = i;
    } else {
      if (start >= 0 && i - start >= minLength) {
        const slice = bytes.subarray(start, Math.min(i, start + 256));
        hits.push({
          offset: baseOffset + start,
          length: i - start,
          encoding: "ascii",
          text: new TextDecoder("ascii").decode(slice),
        });
      }
      start = -1;
    }
  }

  // 2. UTF-16LE pass (common in Windows PE / binary strings)
  let uStart = -1;
  let uChars: string[] = [];
  for (let i = 0; i + 1 < bytes.byteLength && hits.length < maxHits; i += 2) {
    if (isPrintable(bytes[i]) && bytes[i + 1] === 0x00) {
      if (uStart < 0) uStart = i;
      uChars.push(String.fromCharCode(bytes[i]));
    } else {
      if (uStart >= 0 && uChars.length >= minLength) {
        hits.push({
          offset: baseOffset + uStart,
          length: uChars.length * 2,
          encoding: "utf16le",
          text: uChars.slice(0, 256).join(""),
        });
      }
      uStart = -1;
      uChars = [];
    }
  }
  if (uStart >= 0 && uChars.length >= minLength && hits.length < maxHits) {
    hits.push({
      offset: baseOffset + uStart,
      length: uChars.length * 2,
      encoding: "utf16le",
      text: uChars.slice(0, 256).join(""),
    });
  }

  return hits.sort((a, b) => a.offset - b.offset);
}
