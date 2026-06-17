import { Document, Packer, Paragraph, TextRun } from "docx";

/**
 * Replace {{ キー }} placeholders in a template body with extracted field
 * values. Missing keys are rendered as 〔キー〕 so the human can fill them in.
 */
export function fillTemplate(
  body: string,
  fields: Record<string, string | number | null>,
): string {
  return body.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, raw) => {
    const key = String(raw).trim();
    const v = fields[key];
    return v === undefined || v === null || v === "" ? `〔${key}〕` : String(v);
  });
}

/** Build a .docx buffer from a title + filled body (one paragraph per line). */
export async function buildDocx(
  title: string,
  filledBody: string,
): Promise<Buffer> {
  const bodyParagraphs = filledBody
    .split("\n")
    .map(
      (line) =>
        new Paragraph({ children: [new TextRun({ text: line, size: 22 })] }),
    );

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [new TextRun({ text: title, bold: true, size: 32 })],
          }),
          new Paragraph({ children: [new TextRun({ text: "" })] }),
          ...bodyParagraphs,
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
