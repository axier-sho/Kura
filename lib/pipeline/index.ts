import { extractText } from "@/lib/pipeline/extractText";
import { analyze } from "@/lib/pipeline/analyze";
import { embedAnalysis } from "@/lib/pipeline/embed";
import type { AnalysisResult, ExtractedText, IngestInput } from "@/lib/pipeline/types";

export * from "@/lib/pipeline/types";

export interface PipelineOutput {
  extracted: ExtractedText;
  analysis: AnalysisResult;
  embedding: number[] | null;
}

/**
 * The core pipeline (no DB): text-first / vision fallback → classify+extract →
 * embed. Reused by both web upload and desktop folder-watch ingestion.
 */
export async function runPipeline(input: IngestInput): Promise<PipelineOutput> {
  const extracted = await extractText(input);
  const analysis = await analyze(extracted, input);
  const embedding = await embedAnalysis(analysis);
  return { extracted, analysis, embedding };
}
