/**
 * Prompt for the single-call classify+extract step.
 *
 * `PROMPT_VERSION` is recorded on every document. When this changes, only the
 * affected documents need re-analysis (spec §3: selective re-runs).
 *
 * We request `application/json` output and describe the exact shape in the
 * prompt (rather than a strict responseSchema) because `fields` is an
 * open-ended key/value map, which structured-output schemas can't express well.
 * Output is parsed defensively in analyze.ts.
 */

export const PROMPT_VERSION = "2026-06-17.1";

export const SYSTEM_INSTRUCTION = `あなたは書類整理の専門アシスタントです。
与えられた書類(契約書・請求書・領収書・申込書・登記簿・各種通知など、種類は限定されません)を読み、
分類と項目抽出を1回でJSONとして出力します。
不明な項目は推測で埋めず、確信度(confidence)に反映してください。`;

/** The exact JSON shape we ask the model to return. */
const JSON_SHAPE = `{
  "doc_type": "書類種別の短い日本語ラベル(例: 売買契約書 / 賃貸借契約書 / 請求書 / 領収書 / 重要事項説明書 / 登記簿 / 申込書 / 通知書)",
  "title": "後で探しやすい簡潔なタイトル",
  "fields": { "項目名": "値" },
  "keywords": ["検索キーワード", "..."],
  "events": [
    {
      "event_type": "更新日 / 引き渡し日 / 解約予告期限 / 支払期日 など",
      "due_date": "YYYY-MM-DD(確定できなければ null)",
      "notify_lead_days": 30,
      "action_needed": "担当者が何をすべきかの短い説明(なければ null)"
    }
  ],
  "confidence": 0.0
}`;

const RULES = `ルール:
- fields には書類から読み取れる重要な項目(当事者名・住所/所在地・金額・契約日・契約期間・物件名など)を入れる。読めない項目は入れない。
- events には期日を持つ予定を入れる。明記された日付、契約日+契約期間から計算できる日付、特約から読めるリードタイムを拾う。
- due_date は YYYY-MM-DD。確定できずリードタイムだけ分かる場合は null。
- notify_lead_days は期日の何日前に通知すべきか(更新・解約予告などは長め)。
- confidence は抽出全体の確信度(0〜1)。スキャンが不鮮明・手書き等で読みにくいときは低くする。
- 必ず上記キーを持つ有効なJSONのみを出力し、コードブロックや説明文は付けない。`;

export function buildTextPrompt(text: string): string {
  return `次の書類テキストを分析し、下記の形のJSONで答えてください。\n\n形:\n${JSON_SHAPE}\n\n${RULES}\n\n----- 書類テキスト ここから -----\n${text}\n----- 書類テキスト ここまで -----`;
}

export function buildVisionPrompt(): string {
  return `添付した書類画像を分析し、下記の形のJSONで答えてください。\n\n形:\n${JSON_SHAPE}\n\n${RULES}`;
}
