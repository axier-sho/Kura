import { NextResponse, type NextRequest } from "next/server";
import { buildDocx, fillTemplate } from "@/lib/drafts/docx";
import * as documents from "@/lib/db/repositories/documents";
import * as templates from "@/lib/db/repositories/templates";

export const runtime = "nodejs";

/**
 * Generate a .docx draft (spec §7): fill a template's placeholders with a
 * document's extracted fields. The result is a DRAFT a person reviews and
 * finalizes it, then re-uploads (re-entering the pipeline, closing the loop).
 */
export async function POST(req: NextRequest) {
  let templateId: string | undefined;
  let documentId: string | undefined;
  try {
    ({ templateId, documentId } = (await req.json()) as {
      templateId?: string;
      documentId?: string;
    });
  } catch {
    return NextResponse.json(
      { error: "不正なリクエストです。" },
      { status: 400 },
    );
  }
  if (!templateId || !documentId) {
    return NextResponse.json(
      { error: "テンプレートと書類を選択してください。" },
      { status: 400 },
    );
  }

  const template = templates.getById(templateId);
  const document = documents.getById(documentId);

  if (!template || !document) {
    return NextResponse.json({ error: "見つかりません。" }, { status: 404 });
  }

  let buffer: Buffer;
  try {
    const filled = fillTemplate(template.body, document.extracted_fields ?? {});
    buffer = await buildDocx(template.name, filled);
  } catch (err) {
    // fillTemplate runs a regex over an untrusted template body and buildDocx's
    // Packer.toBuffer() can reject; without this the route would return Next's
    // 500 HTML page instead of the { error } JSON every other route returns.
    console.error("[kura] draft generation failed:", err);
    return NextResponse.json(
      { error: "ドラフトの生成に失敗しました。" },
      { status: 500 },
    );
  }

  const filename = encodeURIComponent(`${template.name}_draft.docx`);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
