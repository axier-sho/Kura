import { embed as geminiEmbed } from "@/lib/gemini";
import type { AnalysisResult } from "@/lib/pipeline/types";

/**
 * Build the text we embed for semantic search: title + doc_type + keywords +
 * the field values. This is what 意味検索 matches against.
 */
export function buildEmbeddingText(a: AnalysisResult): string {
  const fieldText = Object.entries(a.fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  return [a.title, a.doc_type, a.keywords.join(", "), fieldText]
    .filter(Boolean)
    .join("\n");
}

/** Returns an embedding vector, or null when Gemini is not configured. */
export async function embedAnalysis(
  a: AnalysisResult,
): Promise<number[] | null> {
  return geminiEmbed(buildEmbeddingText(a));
}
