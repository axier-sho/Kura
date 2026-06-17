import { env, isGeminiConfigured } from "@/lib/env";
import { generate, type GeminiPart } from "@/lib/gemini";
import {
  PROMPT_VERSION,
  SYSTEM_INSTRUCTION,
  buildTextPrompt,
  buildVisionPrompt,
} from "@/lib/pipeline/prompts";
import type {
  AnalysisResult,
  ExtractedEvent,
  ExtractedText,
  IngestInput,
} from "@/lib/pipeline/types";

/** Escalate to the stronger model below this confidence. */
const ESCALATION_THRESHOLD = 0.6;

function stripFences(s: string): string {
  const trimmed = s.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fence ? fence[1] : trimmed).trim();
}

function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

function normalizeEvents(raw: unknown): ExtractedEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: ExtractedEvent[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const r = e as Record<string, unknown>;
    const eventType = toStr(r.event_type);
    if (!eventType) continue;
    let due = toStr(r.due_date);
    if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) due = null;
    const lead = Number(r.notify_lead_days);
    out.push({
      event_type: eventType,
      due_date: due,
      notify_lead_days: Number.isFinite(lead) ? Math.max(0, Math.round(lead)) : 14,
      action_needed: toStr(r.action_needed),
    });
  }
  return out;
}

function normalizeFields(raw: unknown): Record<string, string | number | null> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string | number | null> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "number") out[k] = v;
    else {
      const s = toStr(v);
      if (s !== null) out[k] = s;
    }
  }
  return out;
}

function parseAnalysis(text: string, model: string): AnalysisResult {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(stripFences(text)) as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  const confidence = Number(parsed.confidence);
  return {
    doc_type: toStr(parsed.doc_type) ?? "不明",
    title: toStr(parsed.title) ?? "無題の書類",
    fields: normalizeFields(parsed.fields),
    keywords: Array.isArray(parsed.keywords)
      ? (parsed.keywords as unknown[]).map(toStr).filter((s): s is string => !!s)
      : [],
    events: normalizeEvents(parsed.events),
    confidence: Number.isFinite(confidence)
      ? Math.min(1, Math.max(0, confidence))
      : 0.5,
    model,
    prompt_version: PROMPT_VERSION,
    is_stub: false,
  };
}

/** Resolve a Gemini-supported vision MIME type, or null if unsupported. */
function visionMimeType(input: IngestInput): string | null {
  const mime = input.mimeType.toLowerCase();
  const name = input.filename.toLowerCase();
  if (mime.startsWith("image/")) return input.mimeType;
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "application/pdf";
  if (/\.(png)$/.test(name)) return "image/png";
  if (/\.(jpe?g)$/.test(name)) return "image/jpeg";
  if (/\.(webp)$/.test(name)) return "image/webp";
  if (/\.(gif)$/.test(name)) return "image/gif";
  return null;
}

/**
 * Build the request parts. Returns null when the input needs vision but isn't a
 * vision-capable type AND has no text the caller then returns a stub rather
 * than sending arbitrary bytes mislabeled as image/png.
 */
function buildParts(
  extracted: ExtractedText,
  input: IngestInput,
): GeminiPart[] | null {
  if (extracted.needsVision) {
    const mimeType = visionMimeType(input);
    if (!mimeType) {
      // Unsupported binary (e.g. failed DOCX extraction, unknown extension).
      const text = extracted.text.trim();
      return text ? [{ text: buildTextPrompt(text) }] : null;
    }
    const data = Buffer.from(input.bytes).toString("base64");
    return [{ text: buildVisionPrompt() }, { inlineData: { mimeType, data } }];
  }
  return [{ text: buildTextPrompt(extracted.text) }];
}

function stubResult(input: IngestInput): AnalysisResult {
  return {
    doc_type: "未分類(AI未設定)",
    title: input.filename,
    fields: { ファイル名: input.filename },
    keywords: [input.filename],
    events: [],
    confidence: 0,
    model: "stub",
    prompt_version: PROMPT_VERSION,
    is_stub: true,
  };
}

/**
 * Classify + extract in (up to two) Gemini calls.
 * Step C of the pipeline. Escalates flash → pro when confidence is low.
 * Returns a clearly-labeled stub when Gemini is not configured (env-gating).
 */
export async function analyze(
  extracted: ExtractedText,
  input: IngestInput,
): Promise<AnalysisResult> {
  if (!isGeminiConfigured()) return stubResult(input);

  const parts = buildParts(extracted, input);
  if (!parts) {
    return { ...stubResult(input), doc_type: "未分類(形式非対応)" };
  }

  let result: AnalysisResult;
  try {
    const text = await generate({
      model: env.geminiModel,
      systemInstruction: SYSTEM_INSTRUCTION,
      parts,
      json: true,
    });
    result = parseAnalysis(text, env.geminiModel);
  } catch (err) {
    console.error("[kura] analyze flash failed:", err);
    return { ...stubResult(input), doc_type: "未分類(解析エラー)" };
  }

  // Resolution/model escalation (spec §4): retry on the stronger model when the
  // first pass is not confident.
  if (
    result.confidence < ESCALATION_THRESHOLD &&
    env.geminiModelEscalation &&
    env.geminiModelEscalation !== env.geminiModel
  ) {
    try {
      const text = await generate({
        model: env.geminiModelEscalation,
        systemInstruction: SYSTEM_INSTRUCTION,
        parts,
        json: true,
      });
      const escalated = parseAnalysis(text, env.geminiModelEscalation);
      if (escalated.confidence >= result.confidence) result = escalated;
    } catch (err) {
      console.error("[kura] analyze escalation failed:", err);
    }
  }

  return result;
}
