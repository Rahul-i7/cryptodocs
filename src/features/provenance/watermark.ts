import { PDFDocument, PDFName, PDFString, rgb, StandardFonts } from "pdf-lib";

/**
 * Session watermark. Pages are NOT visibly changed: the marker is carried by three redundant,
 * non-rendered channels - 1pt near-white micro-text on every page, the PDF Info dictionary
 * (Keywords, Subject, custom AegisWM key). Recovery works on the original copy and on any copy
 * that preserves page content or metadata. It does NOT survive rasterisation (print-scan,
 * screenshots) or deliberate scrubbing; see docs/architecture.md for the hardening roadmap.
 */
const PREFIX = "AEGIS-WM:";
const PATTERN = /AEGIS-WM:(WM-[0-9A-F]{16})\|([0-9a-f]{16})/;

export interface Marker { watermarkId: string; tag: string }

export async function embedWatermark(pdf: Uint8Array, marker: Marker): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Courier);
  const token = `${PREFIX}${marker.watermarkId}|${marker.tag}`;
  for (const page of doc.getPages()) {
    const { width } = page.getSize();
    page.drawText(token, { x: Math.max(2, width - 4), y: 2, size: 1, font, color: rgb(0.996, 0.996, 0.996) });
  }
  doc.setKeywords([token]);
  doc.setSubject(token);
  (doc as unknown as { getInfoDict(): { set(k: PDFName, v: PDFString): void } }).getInfoDict().set(PDFName.of("AegisWM"), PDFString.of(token));
  return doc.save({ useObjectStreams: false });
}

export async function extractWatermark(bytes: Uint8Array): Promise<Marker | null> {
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    for (const field of [doc.getKeywords(), doc.getSubject()]) {
      const m = field?.match(PATTERN);
      if (m) return { watermarkId: m[1] ?? "", tag: m[2] ?? "" };
    }
  } catch {
    // fall through to raw scan
  }
  const m = new TextDecoder("latin1").decode(bytes).match(PATTERN);
  return m ? { watermarkId: m[1] ?? "", tag: m[2] ?? "" } : null;
}

export async function isPdf(bytes: Uint8Array): Promise<boolean> {
  return new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-";
}
