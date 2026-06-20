import type { ExtractedText, IngestInput } from "@/lib/pipeline/types";

/** Minimum characters of extracted text before we trust the text layer. */
const MIN_TEXT_LEN = 40;

function isImage(mime: string, filename: string): boolean {
  if (mime.startsWith("image/")) return true;
  // Only the formats Gemini vision actually accepts. BMP/TIFF are deliberately
  // excluded: analyze.visionMimeType() can't map them, so claiming them here
  // produced a document detected-as-image that was then silently stubbed. They
  // now fall through to the unknown-binary path and are stubbed honestly.
  return /\.(png|jpe?g|webp|gif)$/i.test(filename);
}

function isPdf(mime: string, filename: string): boolean {
  return mime === "application/pdf" || /\.pdf$/i.test(filename);
}

function isDocx(mime: string, filename: string): boolean {
  return (
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    /\.docx$/i.test(filename)
  );
}

function isPlainText(mime: string, filename: string): boolean {
  return mime.startsWith("text/") || /\.(txt|md|csv)$/i.test(filename);
}

/**
 * Text-first / vision-fallback (spec pipeline step B).
 * - DOCX → mammoth
 * - text-layer PDF → unpdf
 * - plain text → decode
 * - images / scanned PDFs with no text layer → needsVision = true
 */
export async function extractText(input: IngestInput): Promise<ExtractedText> {
  const { bytes, filename, mimeType } = input;

  if (isImage(mimeType, filename)) {
    return { text: "", needsVision: true };
  }

  if (isPlainText(mimeType, filename)) {
    const text = new TextDecoder().decode(bytes).trim();
    return { text, needsVision: text.length < MIN_TEXT_LEN };
  }

  if (isDocx(mimeType, filename)) {
    try {
      const mammoth = (await import("mammoth")).default;
      const { value } = await mammoth.extractRawText({
        buffer: Buffer.from(bytes),
      });
      const text = (value ?? "").trim();
      return { text, needsVision: text.length < MIN_TEXT_LEN };
    } catch {
      return { text: "", needsVision: true };
    }
  }

  if (isPdf(mimeType, filename)) {
    try {
      const { extractText: extractPdf, getDocumentProxy } = await import(
        "unpdf"
      );
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const { text } = await extractPdf(pdf, { mergePages: true });
      const merged = (Array.isArray(text) ? text.join("\n") : text ?? "").trim();
      // Scanned PDFs have no/low text layer → fall back to vision.
      return { text: merged, needsVision: merged.length < MIN_TEXT_LEN };
    } catch {
      return { text: "", needsVision: true };
    }
  }

  // Unknown type: try decoding as UTF-8 text, else fall back to vision/stub.
  // A fatal decoder throws on binary (e.g. .xlsx/.pptx/.zip) instead of yielding
  // a string of U+FFFD replacement chars that would (if long enough) be sent to
  // Gemini as a bogus text prompt, wasting the user's BYOK quota.
  try {
    const fallback = new TextDecoder("utf-8", { fatal: true })
      .decode(bytes)
      .trim();
    return { text: fallback, needsVision: fallback.length < MIN_TEXT_LEN };
  } catch {
    return { text: "", needsVision: true };
  }
}
