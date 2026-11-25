"use client";

import React, { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FileSearch, Upload } from "lucide-react";
import { useWorkspaceStore } from "@/stores/workspace-store";

interface QuickProbeResult {
  name: string;
  sizeBytes: number;
  declaredExt: string;
  headerHex: string;
  detectedFormat: string;
  detectedMime: string;
  mismatch: boolean;
}

function detectHeaderPreview(bytes: Uint8Array, ext: string) {
  const hex = Array.from(bytes.slice(0, 16))
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join(" ");

  const startsWith = (sig: number[], offset = 0) =>
    bytes.length >= offset + sig.length &&
    sig.every((val, idx) => bytes[offset + idx] === val);

  const asciiAt = (offset: number, str: string) => {
    if (bytes.length < offset + str.length) return false;
    for (let i = 0; i < str.length; i++) {
      if (bytes[offset + i] !== str.charCodeAt(i)) return false;
    }
    return true;
  };

  let format = "Unknown Binary";
  let mime = "application/octet-stream";
  let expectedExts: string[] = [];

  if (startsWith([0xff, 0xd8, 0xff])) {
    format = "JPEG Image";
    mime = "image/jpeg";
    expectedExts = ["jpg", "jpeg", "jpe"];
  } else if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    format = "PNG Image";
    mime = "image/png";
    expectedExts = ["png"];
  } else if (asciiAt(0, "GIF87a") || asciiAt(0, "GIF89a")) {
    format = "GIF Image";
    mime = "image/gif";
    expectedExts = ["gif"];
  } else if (asciiAt(0, "%PDF-")) {
    format = "PDF Document";
    mime = "application/pdf";
    expectedExts = ["pdf"];
  } else if (startsWith([0x50, 0x4b, 0x03, 0x04])) {
    format = "ZIP Container (or Office OpenXML)";
    mime = "application/zip";
    expectedExts = ["zip", "docx", "xlsx", "pptx", "odt", "ods", "odp", "epub"];
  } else if (asciiAt(0, "RIFF") && asciiAt(8, "WEBP")) {
    format = "WebP Image";
    mime = "image/webp";
    expectedExts = ["webp"];
  } else if (asciiAt(0, "RIFF") && asciiAt(8, "WAVE")) {
    format = "WAV Audio";
    mime = "audio/wav";
    expectedExts = ["wav"];
  } else if (asciiAt(4, "ftyp")) {
    format = "ISO BMFF Container (MP4/MOV/HEIC)";
    mime = "video/mp4";
    expectedExts = ["mp4", "m4v", "m4a", "mov", "heic", "heif", "avif", "3gp"];
  } else if (startsWith([0x7f, 0x45, 0x4c, 0x46])) {
    format = "Linux ELF Executable";
    mime = "application/x-elf";
    expectedExts = ["", "elf", "so", "o", "bin"];
  } else if (startsWith([0x4d, 0x5a])) {
    format = "DOS / Windows PE Header (MZ)";
    mime = "application/vnd.microsoft.portable-executable";
    expectedExts = ["exe", "dll", "sys"];
  } else if (asciiAt(0, "ID3")) {
    format = "MP3 Audio (ID3v2)";
    mime = "audio/mpeg";
    expectedExts = ["mp3"];
  } else if (asciiAt(0, "fLaC")) {
    format = "FLAC Audio";
    mime = "audio/flac";
    expectedExts = ["flac"];
  } else if (asciiAt(0, "OggS")) {
    format = "OGG Container";
    mime = "audio/ogg";
    expectedExts = ["ogg", "oga", "opus"];
  }

  const normalizedExt = ext.toLowerCase();
  const mismatch =
    expectedExts.length > 0 &&
    normalizedExt.length > 0 &&
    !expectedExts.includes(normalizedExt);

  return { hex, format, mime, mismatch };
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

export function HeroDropzone() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [probe, setProbe] = useState<QuickProbeResult | null>(null);

  const inspectFileSlice = async (file: File) => {
    setSelectedFile(file);
    const slice = file.slice(0, 64);
    const buffer = await slice.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const dotIdx = file.name.lastIndexOf(".");
    const ext = dotIdx > 0 ? file.name.slice(dotIdx + 1) : "";
    const result = detectHeaderPreview(bytes, ext);

    setProbe({
      name: file.name,
      sizeBytes: file.size,
      declaredExt: ext ? `.${ext}` : "(none)",
      headerHex: result.hex || "(empty file)",
      detectedFormat: result.format,
      detectedMime: result.mime,
      mismatch: result.mismatch,
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void inspectFileSlice(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void inspectFileSlice(file);
  };

  return (
    <div className="mx-auto mt-8 w-full max-w-[600px]">
      <input
        ref={inputRef}
        type="file"
        aria-label="Choose a file to inspect locally"
        onChange={handleChange}
        className="sr-only"
      />

      {/* Focal pill dropzone inspired by Railroad.ai, Dispatch, and UGH */}
      <div
        role="region"
        aria-label="Local file signature dropzone"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex flex-col gap-2.5 rounded-2xl border p-2 backdrop-blur-md transition-colors sm:flex-row sm:items-center sm:rounded-full sm:p-1.5 sm:pl-5 ${
          dragging
            ? "border-[#34d399] bg-[#34d399]/18"
            : "border-white/25 bg-[#09151d]/82 shadow-[0_8px_30px_rgba(4,10,15,0.45)]"
        }`}
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 text-left text-sm text-[#cbd5e1] transition-colors hover:text-[#f8fafc]"
        >
          <Upload className="h-4 w-4 shrink-0 text-[#e58649]" aria-hidden="true" />
          <span className="truncate">Drop any file here or browse locally...</span>
        </button>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-[#f4f7fa] px-5 py-2 text-sm font-medium text-[#091116] shadow-sm transition-all hover:bg-white"
        >
          <span>Inspect a File</span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Calm italic-serif trust micro-caption */}
      <p className="font-serif-display mt-3.5 text-center text-sm italic tracking-wide text-[#dbe6f0]">
        Local-first in your browser. Zero silent uploads.
      </p>

      {probe && (
        <div
          aria-live="polite"
          className="mt-5 rounded-xl border border-white/20 bg-[#09151d]/92 p-4 text-left text-[#f4f7fa] shadow-xl backdrop-blur-md"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/15 pb-3">
            <div className="flex min-w-0 items-center gap-2">
              <FileSearch className="h-4 w-4 shrink-0 text-[#34d399]" aria-hidden="true" />
              <span className="truncate text-sm font-medium text-[#f8fafc]">
                {probe.name}
              </span>
            </div>
            <span className="font-mono-tech text-xs text-[#cbd5e1]">
              {formatBytes(probe.sizeBytes)} • Ext: {probe.declaredExt}
            </span>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="font-mono-tech text-[11px] uppercase tracking-wider text-[#94a3b8]">
                Binary Signature Match
              </p>
              <p className="mt-1 text-sm font-medium text-[#f8fafc]">
                {probe.detectedFormat}
              </p>
              <p className="font-mono-tech mt-0.5 text-xs text-[#cbd5e1]">
                {probe.detectedMime}
              </p>
            </div>

            <div>
              <p className="font-mono-tech text-[11px] uppercase tracking-wider text-[#94a3b8]">
                Offset 0x00000000 (First 16 Bytes)
              </p>
              <p className="font-mono-tech mt-1 break-all text-xs text-[#34d399]">
                {probe.headerHex}
              </p>
              {probe.mismatch && (
                <p className="mt-1 text-xs font-medium text-[#fbbf24]">
                  Extension mismatch: declared {probe.declaredExt} vs. detected signature.
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/15 pt-3">
            <span className="font-mono-tech text-[11px] text-[#94a3b8]">
              Read 64 bytes locally • 0 bytes transmitted
            </span>
            <button
              type="button"
              onClick={() => {
                if (selectedFile) {
                  useWorkspaceStore.getState().addFile(selectedFile, "queued");
                }
                router.push("/workspace");
              }}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#34d399] hover:underline"
            >
              <span>Open Full Analysis Workspace</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
