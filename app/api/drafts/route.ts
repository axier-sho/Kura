import { NextResponse, type NextRequest } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { buildDocx, fillTemplate } from "@/lib/drafts/docx";
import type { DocumentRow, TemplateRow } from "@/lib/db/types";

export const runtime = "nodejs";

/**
 * Generate a .docx draft (spec §7): fill a template's placeholders with a
 * document's extracted fields. The result is a DRAFT a person reviews and
 * finalizes it, then re-uploads (re-entering the pipeline, closing the loop).
 */
export async function POST(req: NextRequest) {
  const { supabase, orgId } = await getSessionContext();
  if (!supabase || !orgId) {
    return NextResponse.json({ error: "未認証" }, { status: 401 });
  }

  const { templateId, documentId } = (await req.json()) as {
    templateId?: string;
    documentId?: string;
  };
  if (!templateId || !documentId) {
    return NextResponse.json(
      { error: "テンプレートと書類を選択してください。" },
      { status: 400 },
    );
  }

  const [{ data: tpl }, { data: doc }] = await Promise.all([
    supabase
      .from("templates")
      .select("*")
      .eq("id", templateId)
      .eq("org_id", orgId)
      .maybeSingle(),
    supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .eq("org_id", orgId)
      .maybeSingle(),
  ]);

  if (!tpl || !doc) {
    return NextResponse.json({ error: "見つかりません。" }, { status: 404 });
  }

  const template = tpl as TemplateRow;
  const document = doc as DocumentRow;

  const filled = fillTemplate(template.body, document.extracted_fields ?? {});
  const buffer = await buildDocx(template.name, filled);

  const filename = encodeURIComponent(`${template.name}_draft.docx`);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
