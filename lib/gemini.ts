import { GoogleGenAI } from "@google/genai";
import { env, isGeminiConfigured } from "@/lib/env";

let client: GoogleGenAI | null = null;

/** Lazily construct the Gemini client. Returns null when no key is configured. */
export function getGemini(): GoogleGenAI | null {
  if (!isGeminiConfigured()) return null;
  if (!client) client = new GoogleGenAI({ apiKey: env.geminiApiKey });
  return client;
}

export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

/**
 * Single text/multimodal generation returning the raw text response.
 * Throws if Gemini is not configured callers gate on isGeminiConfigured().
 */
export async function generate(opts: {
  model: string;
  systemInstruction?: string;
  parts: GeminiPart[];
  json?: boolean;
}): Promise<string> {
  const ai = getGemini();
  if (!ai) throw new Error("Gemini is not configured (GEMINI_API_KEY missing)");

  const res = await ai.models.generateContent({
    model: opts.model,
    contents: [{ role: "user", parts: opts.parts }],
    config: {
      ...(opts.systemInstruction
        ? { systemInstruction: opts.systemInstruction }
        : {}),
      ...(opts.json ? { responseMimeType: "application/json" } : {}),
    },
  });

  return res.text ?? "";
}

/** Embed a single string. Returns null when Gemini is not configured. */
export async function embed(text: string): Promise<number[] | null> {
  const ai = getGemini();
  if (!ai) return null;

  const res = await ai.models.embedContent({
    model: env.geminiEmbeddingModel,
    contents: text,
    config: { outputDimensionality: env.geminiEmbeddingDim },
  });

  const values = res.embeddings?.[0]?.values;
  return values ?? null;
}
