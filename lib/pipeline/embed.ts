import { embed as geminiEmbed } from "@/lib/gemini";
import type { AiConfig } from "@/lib/ai/config";
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

/** Returns an embedding vector, or null when the user has no API key set. */
export async function embedAnalysis(
  a: AnalysisResult,
  ai: AiConfig,
): Promise<number[] | null> {
  if (!ai.configured) return null;
  return geminiEmbed({ apiKey: ai.apiKey, text: buildEmbeddingText(a) });
}
