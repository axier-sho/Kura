import type { ExtractedText, IngestInput } from "@/lib/pipeline/types";

/** Minimum characters of extracted text before we trust the text layer. */
const MIN_TEXT_LEN = 40;

function isImage(mime: string, filename: string): boolean {
  if (mime.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(filename);
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

  // Unknown type: try decoding as text, else vision.
  const fallback = new TextDecoder().decode(bytes).trim();
  return { text: fallback, needsVision: fallback.length < MIN_TEXT_LEN };
}
