import { NextResponse } from "next/server";
import { ApiError } from "@google/genai";
import { getAiConfig } from "@/lib/ai/config";
import { generate } from "@/lib/gemini";

export const runtime = "nodejs";

/**
 * Map a thrown Gemini error to a clean Japanese message. The SDK's
 * `ApiError.message` is the full stringified JSON body (e.g. `{"error":{...}}`),
 * so returning it verbatim shows the user raw JSON. Translate the common cases
 * by HTTP status and fall back to a generic message — never the raw body.
 */
function friendlyGeminiError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.status) {
      case 400:
      case 401:
      case 403:
        return "API キーが無効か、権限がありません。Google AI Studio で取得した正しいキーを入力してください。";
      case 404:
        return "指定したモデルが見つかりません。設定のモデル ID を確認してください。";
      case 429:
        return "リクエスト制限に達しました。しばらくしてから再度お試しください。";
      default:
        if (err.status >= 500)
          return "Gemini サーバーが一時的に応答していません。しばらくしてからお試しください。";
        return "Gemini への接続に失敗しました。";
    }
  }
  return "Gemini への接続に失敗しました。ネットワーク接続をご確認ください。";
}

/**
 * Validate the currently-stored Gemini key with one tiny generate call, so the
 * user gets immediate, explicit feedback that their key works — instead of
 * discovering it silently failed only when every ingested document comes back
 * as a "解析エラー" stub.
 */
export async function POST() {
  try {
    // getAiConfig() reads settings via getDb(), which lazily opens SQLite on the
    // first request of the worker process. Keep it inside the try so a DB-open
    // failure still returns this route's { ok, error } JSON contract rather than
    // Next's 500 HTML page (which the client parses as {} → misleading message).
    const ai = getAiConfig();
    if (!ai.configured) {
      return NextResponse.json({
        ok: false,
        error: "API キーが設定されていません。",
      });
    }
    await generate({
      apiKey: ai.apiKey,
      model: ai.model,
      parts: [{ text: "ping" }],
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: friendlyGeminiError(err),
    });
  }
}
