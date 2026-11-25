import type { DetectedStructure } from "@trace/shared-types";

export interface DataInspectorValues {
  offsetHex: string;
  binary8: string;
  uint8: number;
  int8: number;
  uint16LE: number | null;
  uint16BE: number | null;
  int32LE: number | null;
  uint32LE: number | null;
  uint32BE: number | null;
  uint64LE: string | null;
  float32LE: string | null;
  asciiChar: string;
}

export function decodeDataInspector(
  bytes: Uint8Array,
  absoluteOffset: number
): DataInspectorValues | null {
  if (bytes.byteLength === 0) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const b0 = bytes[0];
  const asciiChar = b0 >= 0x20 && b0 <= 0x7e ? String.fromCharCode(b0) : ".";

  return {
    offsetHex: `0x${absoluteOffset.toString(16).toUpperCase().padStart(8, "0")}`,
    binary8: `0b${b0.toString(2).padStart(8, "0")}`,
    uint8: dv.getUint8(0),
    int8: dv.getInt8(0),
    uint16LE: bytes.byteLength >= 2 ? dv.getUint16(0, true) : null,
    uint16BE: bytes.byteLength >= 2 ? dv.getUint16(0, false) : null,
    int32LE: bytes.byteLength >= 4 ? dv.getInt32(0, true) : null,
    uint32LE: bytes.byteLength >= 4 ? dv.getUint32(0, true) : null,
    uint32BE: bytes.byteLength >= 4 ? dv.getUint32(0, false) : null,
    uint64LE: bytes.byteLength >= 8 ? dv.getBigUint64(0, true).toString() : null,
    float32LE:
      bytes.byteLength >= 4
        ? Number.isFinite(dv.getFloat32(0, true))
          ? dv.getFloat32(0, true).toPrecision(6)
          : String(dv.getFloat32(0, true))
        : null,
    asciiChar,
  };
}

export function parseHexPattern(input: string): Uint8Array | null {
  const cleaned = input.replace(/0x/gi, "").replace(/[\s,:-]+/g, "");
  if (cleaned.length === 0 || cleaned.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(cleaned)) {
    return null;
  }
  const out = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function parseOffsetInput(input: string, maxByteLength: number): number | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;
  const value = trimmed.startsWith("0x")
    ? Number.parseInt(trimmed.slice(2), 16)
    : /^\d+$/.test(trimmed)
      ? Number.parseInt(trimmed, 10)
      : Number.NaN;

  if (!Number.isSafeInteger(value) || value < 0) return null;
  if (maxByteLength === 0) return 0;
  return Math.min(value, Math.max(0, maxByteLength - 1));
}

export function flattenStructures(nodes: DetectedStructure[]): DetectedStructure[] {
  const flat: DetectedStructure[] = [];
  const walk = (list: DetectedStructure[]) => {
    for (const node of list) {
      flat.push(node);
      if (node.children?.length) walk(node.children);
    }
  };
  walk(nodes);
  return flat;
}

/**
 * Search a Blob incrementally in bounded windows without loading the entire file into RAM.
 * Supports patterns spanning chunk boundaries via overlap padding.
 */
export async function searchBlobPattern(
  file: Blob,
  pattern: Uint8Array,
  options: {
    startOffset?: number;
    chunkSizeBytes?: number;
    signal?: AbortSignal;
    onProgress?: (percent: number) => void;
  } = {}
): Promise<number | null> {
  if (pattern.byteLength === 0 || file.size < pattern.byteLength) return null;

  const chunkSize = options.chunkSizeBytes ?? 1024 * 1024; // 1 MiB bounded chunk
  const overlap = pattern.byteLength - 1;
  let offset = Math.max(0, options.startOffset ?? 0);

  while (offset < file.size) {
    if (options.signal?.aborted) {
      throw new DOMException("Search aborted", "AbortError");
    }
    const readEnd = Math.min(file.size, offset + chunkSize + overlap);
    const buf = new Uint8Array(await file.slice(offset, readEnd).arrayBuffer());

    const limit = buf.byteLength - pattern.byteLength;
    for (let i = 0; i <= limit; i++) {
      let match = true;
      for (let j = 0; j < pattern.length; j++) {
        if (buf[i + j] !== pattern[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        return offset + i;
      }
    }

    offset += chunkSize;
    options.onProgress?.(Math.min(100, (offset / file.size) * 100));
  }

  return null;
}
