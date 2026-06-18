import { GoogleGenAI } from "@google/genai";
import { env } from "@/lib/env";

// One client per distinct API key — with BYOK, keys vary per user/request.
const clients = new Map<string, GoogleGenAI>();

/** Lazily construct a Gemini client for the given key. Returns null when empty. */
export function getGemini(apiKey: string): GoogleGenAI | null {
  if (!apiKey) return null;
  let client = clients.get(apiKey);
  if (!client) {
    client = new GoogleGenAI({ apiKey });
    clients.set(apiKey, client);
  }
  return client;
}

export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

/**
 * Single text/multimodal generation returning the raw text response.
 * Throws if no API key is given callers gate on AiConfig.configured.
 */
export async function generate(opts: {
  apiKey: string;
  model: string;
  systemInstruction?: string;
  parts: GeminiPart[];
  json?: boolean;
}): Promise<string> {
  const ai = getGemini(opts.apiKey);
  if (!ai) throw new Error("Gemini is not configured (API key missing)");

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

/** Embed a single string with the given key. Returns null when no key is set. */
export async function embed(opts: {
  apiKey: string;
  text: string;
}): Promise<number[] | null> {
  const ai = getGemini(opts.apiKey);
  if (!ai) return null;

  const res = await ai.models.embedContent({
    model: env.geminiEmbeddingModel,
    contents: opts.text,
    config: { outputDimensionality: env.geminiEmbeddingDim },
  });

  const values = res.embeddings?.[0]?.values;
  return values ?? null;
}
