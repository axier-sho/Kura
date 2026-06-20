/**
 * AI routing: given an analyzed document and the working directory's existing
 * category subfolders, choose the best target folder — an existing one, a
 * proposed new one, or none (hold in inbox).
 *
 * Hybrid strategy: embed the document and the folder names, rank folders by
 * cosine similarity to build a shortlist, then make a single Gemini call to
 * pick among the shortlist or propose a new folder. Falls back to "hold" when
 * Gemini is unconfigured or the document is a stub.
 */
import { embed, generate } from "@/lib/gemini";
import { cosine } from "@/lib/db/vector";
import { buildEmbeddingText } from "@/lib/pipeline/embed";
import type { AiConfig } from "@/lib/ai/config";
import type { AnalysisResult } from "@/lib/pipeline/types";

/** At or above this confidence the file is auto-moved; below it is held. */
export const AUTO_MOVE_THRESHOLD = 0.75;

/** How many existing folders to offer Gemini after the embedding pre-rank. */
const SHORTLIST_SIZE = 8;

export interface FolderChoice {
  /** Chosen existing or proposed-new folder name; null means "hold in inbox". */
  folderName: string | null;
  /** True when folderName is a new folder to be created. */
  isNew: boolean;
  /** Confidence in [0,1]. */
  confidence: number;
  reason?: string;
}

const HOLD: FolderChoice = { folderName: null, isNew: false, confidence: 0 };

function stripFences(s: string): string {
  const trimmed = s.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fence ? fence[1] : trimmed).trim();
}

/** Rank existing folder names by embedding similarity to the document. */
async function shortlist(
  analysis: AnalysisResult,
  categories: string[],
  ai: AiConfig,
): Promise<string[]> {
  if (categories.length <= SHORTLIST_SIZE) return categories;
  const docVec = await embed({
    apiKey: ai.apiKey,
    text: buildEmbeddingText(analysis),
  });
  if (!docVec) return categories.slice(0, SHORTLIST_SIZE);
  // Embed folder names concurrently. Serial await-in-loop multiplies latency by
  // the folder count and, with many folders, can blow the route's 60s
  // maxDuration cap mid-run. A single folder's embed failure scores 0 rather
  // than aborting the whole shortlist.
  const scored = await Promise.all(
    categories.map(async (name) => {
      try {
        const vec = await embed({ apiKey: ai.apiKey, text: name });
        return { name, score: vec ? cosine(docVec, vec) : 0 };
      } catch {
        return { name, score: 0 };
      }
    }),
  );
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, SHORTLIST_SIZE)
    .map((s) => s.name);
}

function buildPrompt(analysis: AnalysisResult, candidates: string[]): string {
  const list = candidates.length
    ? candidates.map((c) => `- ${c}`).join("\n")
    : "(既存フォルダなし)";
  return `書類を整理します。下記の書類を、既存フォルダのいずれかに振り分けてください。

書類:
- 種別: ${analysis.doc_type}
- タイトル: ${analysis.title}
- キーワード: ${analysis.keywords.join(", ")}

既存フォルダ:
${list}

判断ルール:
- まず既存フォルダの中から最も適切なものを選ぶ。
- どれにも明確に合わない場合のみ、適切な新しいフォルダ名を提案する(is_new=true)。
- 判断できない場合は folder を null にする。
- confidence は振り分けの確信度(0〜1)。

次の形の有効なJSONのみを出力(説明やコードブロックは付けない):
{ "folder": "フォルダ名 または null", "is_new": false, "confidence": 0.0 }`;
}

export async function chooseTargetFolder(
  analysis: AnalysisResult,
  categories: string[],
  ai: AiConfig,
): Promise<FolderChoice> {
  if (!ai.configured || analysis.is_stub) return HOLD;

  let candidates: string[];
  let text: string;
  try {
    // shortlist() makes its own embed() calls; keep them inside the try so a
    // transient embed failure HOLDs the file (for review) instead of bubbling
    // up to runOrganize as a hard "error".
    candidates = await shortlist(analysis, categories, ai);
    text = await generate({
      apiKey: ai.apiKey,
      model: ai.model,
      parts: [{ text: buildPrompt(analysis, candidates) }],
      json: true,
    });
  } catch (err) {
    console.error("[kura] chooseTargetFolder failed:", err);
    return HOLD;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(stripFences(text)) as Record<string, unknown>;
  } catch {
    return HOLD;
  }

  const folderRaw =
    typeof parsed.folder === "string" ? parsed.folder.trim() : "";
  if (!folderRaw || folderRaw.toLowerCase() === "null") return HOLD;

  const conf = Number(parsed.confidence);
  const confidence = Number.isFinite(conf) ? Math.min(1, Math.max(0, conf)) : 0;

  // A name matching an existing category (case-insensitive) is never "new".
  const existingMatch = categories.find(
    (c) => c.toLowerCase() === folderRaw.toLowerCase(),
  );
  if (existingMatch) {
    return { folderName: existingMatch, isNew: false, confidence };
  }
  return { folderName: folderRaw, isNew: Boolean(parsed.is_new), confidence };
}
