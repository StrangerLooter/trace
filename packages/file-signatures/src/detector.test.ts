import { describe, expect, it } from "vitest";
import { BufferBinaryReader } from "@trace/binary-core";
import {
  clearCustomSignatures,
  detectFileSignature,
  registerCustomSignatures,
} from "./detector";

function fromBytes(bytes: number[], totalLength = bytes.length): BufferBinaryReader {
  const buf = new Uint8Array(totalLength);
  buf.set(bytes, 0);
  return new BufferBinaryReader(buf);
}

function asciiBytes(text: string): number[] {
  return Array.from(text).map((c) => c.charCodeAt(0));
}

describe("detectFileSignature", () => {
  it("identifies JPEG, PNG, GIF, PDF, ZIP, RAR, 7Z, ELF, FLAC, OGG, TIFF, GZIP, SQLite", async () => {
    const jpeg = await detectFileSignature(fromBytes([0xff, 0xd8, 0xff, 0xe1]), {
      fileName: "photo.jpg",
    });
    expect(jpeg.formatId).toBe("jpeg");
    expect(jpeg.confidence).toBe("confirmed");
    expect(jpeg.extensionMismatch).toBe(false);

    const png = await detectFileSignature(
      fromBytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      { fileName: "icon.png" }
    );
    expect(png.formatId).toBe("png");
    expect(png.detectedMime).toBe("image/png");

    const gif = await detectFileSignature(fromBytes(asciiBytes("GIF89a")), {
      fileName: "anim.gif",
    });
    expect(gif.formatId).toBe("gif");

    const pdf = await detectFileSignature(fromBytes(asciiBytes("%PDF-1.7\n")), {
      fileName: "doc.pdf",
    });
    expect(pdf.formatId).toBe("pdf");
    expect(pdf.evidence[0].byteRange).toEqual({ start: 0, length: 5 });

    const rar = await detectFileSignature(
      fromBytes([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00]),
      { fileName: "archive.rar" }
    );
    expect(rar.formatId).toBe("rar");

    const sevenZ = await detectFileSignature(
      fromBytes([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]),
      { fileName: "pack.7z" }
    );
    expect(sevenZ.formatId).toBe("7z");

    const elf = await detectFileSignature(fromBytes([0x7f, 0x45, 0x4c, 0x46, 0x02]), {
      fileName: "a.out",
    });
    expect(elf.formatId).toBe("elf");
    expect(elf.extensionMismatch).toBe(false);

    const flac = await detectFileSignature(fromBytes(asciiBytes("fLaC")), {
      fileName: "track.flac",
    });
    expect(flac.formatId).toBe("flac");

    const ogg = await detectFileSignature(fromBytes(asciiBytes("OggS")), {
      fileName: "voice.opus",
    });
    expect(ogg.formatId).toBe("ogg");
    expect(ogg.extensionMismatch).toBe(false);

    const tiff = await detectFileSignature(fromBytes([0x49, 0x49, 0x2a, 0x00]), {
      fileName: "scan.tiff",
    });
    expect(tiff.formatId).toBe("tiff");

    const gz = await detectFileSignature(fromBytes([0x1f, 0x8b, 0x08]), {
      fileName: "logs.gz",
    });
    expect(gz.formatId).toBe("gzip");

    const sqlite = await detectFileSignature(fromBytes(asciiBytes("SQLite format 3\0")), {
      fileName: "data.sqlite",
    });
    expect(sqlite.formatId).toBe("sqlite");
  });

  it("handles non-zero offsets: PDF preamble, MP4 ftyp, MOV ftyp, RIFF WebP/WAV, TAR ustar", async () => {
    const paddedPdf = fromBytes([...asciiBytes("garbage"), ...asciiBytes("%PDF-1.6")]);
    const pdfRes = await detectFileSignature(paddedPdf, { fileName: "padded.pdf" });
    expect(pdfRes.formatId).toBe("pdf");
    expect(pdfRes.evidence[0].byteRange.start).toBe(7);
    expect(pdfRes.secondaryMatches[0]).toContain("non-zero offset");

    const mp4Header = [0x00, 0x00, 0x00, 0x18, ...asciiBytes("ftypisom"), 0, 0, 0, 0];
    const mp4 = await detectFileSignature(fromBytes(mp4Header), { fileName: "clip.mp4" });
    expect(mp4.formatId).toBe("mp4");
    expect(mp4.containerFormat).toBe("isobmff");

    const movHeader = [0x00, 0x00, 0x00, 0x14, ...asciiBytes("ftypqt  "), 0, 0, 0, 0];
    const mov = await detectFileSignature(fromBytes(movHeader), { fileName: "clip.mov" });
    expect(mov.formatId).toBe("mov");

    const webp = await detectFileSignature(
      fromBytes([...asciiBytes("RIFF"), 0x24, 0, 0, 0, ...asciiBytes("WEBP")]),
      { fileName: "pic.webp" }
    );
    expect(webp.formatId).toBe("webp");
    expect(webp.containerFormat).toBe("riff");

    const wav = await detectFileSignature(
      fromBytes([...asciiBytes("RIFF"), 0x24, 0, 0, 0, ...asciiBytes("WAVE")]),
      { fileName: "snd.wav" }
    );
    expect(wav.formatId).toBe("wav");

    const tarBuf = new Uint8Array(512);
    tarBuf.set(asciiBytes("ustar"), 257);
    const tar = await detectFileSignature(new BufferBinaryReader(tarBuf), {
      fileName: "bundle.tar",
    });
    expect(tar.formatId).toBe("tar");
  });

  it("validates Windows PE e_lfanew pointer and guards against malformed/truncated MZ headers", async () => {
    // Valid PE pointing to offset 0x80
    const peBuf = new Uint8Array(256);
    peBuf[0] = 0x4d; // M
    peBuf[1] = 0x5a; // Z
    new DataView(peBuf.buffer).setUint32(0x3c, 0x80, true);
    peBuf.set([0x50, 0x45, 0x00, 0x00], 0x80); // PE\0\0

    const validPe = await detectFileSignature(new BufferBinaryReader(peBuf), {
      fileName: "invoice.pdf",
    });
    expect(validPe.formatId).toBe("pe");
    expect(validPe.confidence).toBe("confirmed");
    expect(validPe.extensionMismatch).toBe(true);
    expect(validPe.evidence).toHaveLength(2);

    // Malformed PE with out-of-bounds e_lfanew
    const badPeBuf = new Uint8Array(128);
    badPeBuf[0] = 0x4d;
    badPeBuf[1] = 0x5a;
    new DataView(badPeBuf.buffer).setUint32(0x3c, 0xffffffff, true);
    const badPe = await detectFileSignature(new BufferBinaryReader(badPeBuf), {
      fileName: "bad.exe",
    });
    expect(badPe.formatId).toBe("dos_mz");
    expect(badPe.confidence).toBe("probable");

    // Truncated MZ (2 bytes)
    const shortMz = await detectFileSignature(fromBytes([0x4d, 0x5a]), {
      fileName: "tiny.exe",
    });
    expect(shortMz.formatId).toBe("dos_mz");
    expect(shortMz.confidence).toBe("probable");
  });

  it("refines ZIP containers into DOCX, XLSX, PPTX, EPUB, ODT and distinguishes plain ZIP", async () => {
    const plainZip = await detectFileSignature(
      fromBytes([0x50, 0x4b, 0x03, 0x04, ...asciiBytes("readme.txt")]),
      { fileName: "files.zip" }
    );
    expect(plainZip.formatId).toBe("zip");

    const docx = await detectFileSignature(
      fromBytes([0x50, 0x4b, 0x03, 0x04, ...asciiBytes("word/document.xml")]),
      { fileName: "report.docx" }
    );
    expect(docx.formatId).toBe("docx");
    expect(docx.containerFormat).toBe("zip");
    expect(docx.extensionMismatch).toBe(false);

    const epub = await detectFileSignature(
      fromBytes([0x50, 0x4b, 0x03, 0x04, ...asciiBytes("mimetypeapplication/epub+zip")]),
      { fileName: "book.epub" }
    );
    expect(epub.formatId).toBe("epub");
  });

  it("distinguishes ID3 MP3 from weak raw MPEG sync and handles empty/short/mismatched files", async () => {
    const id3 = await detectFileSignature(fromBytes(asciiBytes("ID3\x04\x00")), {
      fileName: "song.mp3",
    });
    expect(id3.formatId).toBe("mp3");
    expect(id3.confidence).toBe("confirmed");

    const rawSync = await detectFileSignature(fromBytes([0xff, 0xfb, 0x90, 0x00]), {
      fileName: "raw.mp3",
    });
    expect(rawSync.formatId).toBe("mp3");
    expect(rawSync.confidence).toBe("probable");

    const renamedPng = await detectFileSignature(
      fromBytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      { fileName: "fake.jpg" }
    );
    expect(renamedPng.formatId).toBe("png");
    expect(renamedPng.extensionMismatch).toBe(true);

    const empty = await detectFileSignature(fromBytes([]), { fileName: "empty.bin" });
    expect(empty.formatId).toBe("unknown");
    expect(empty.confidence).toBe("unknown");
  });

  it("identifies fonts (OTF/WOFF/WOFF2) and executes registered custom signature plugins", async () => {
    const otf = await detectFileSignature(fromBytes(asciiBytes("OTTO\x00\x0c")), { fileName: "font.otf" });
    expect(otf.formatId).toBe("otf");

    const woff = await detectFileSignature(fromBytes(asciiBytes("wOFF")), { fileName: "font.woff" });
    expect(woff.formatId).toBe("woff");

    registerCustomSignatures([
      {
        id: "rule-pcapng",
        formatId: "pcapng",
        displayName: "PCAP-NG Packet Capture",
        category: "other",
        mime: "application/x-pcapng",
        offset: 0,
        hexPattern: "0A 0D 0D 0A",
        extensions: ["pcapng"],
      },
    ]);
    const cap = await detectFileSignature(fromBytes([0x0a, 0x0d, 0x0d, 0x0a, 0x00]), {
      fileName: "net.pcapng",
    });
    expect(cap.formatId).toBe("pcapng");
    expect(cap.evidence[0].ruleId).toBe("custom:rule-pcapng");
    clearCustomSignatures();
  });
});
