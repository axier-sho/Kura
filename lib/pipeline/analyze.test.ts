import { describe, expect, it } from "vitest";
import {
  ESCALATION_THRESHOLD,
  isRealCalendarDate,
  normalizeEvents,
  normalizeFields,
  parseAnalysis,
} from "@/lib/pipeline/analyze";

describe("isRealCalendarDate", () => {
  it("accepts real calendar dates", () => {
    expect(isRealCalendarDate("2026-02-28")).toBe(true);
    expect(isRealCalendarDate("2024-02-29")).toBe(true); // leap year
  });

  it("rejects impossible and malformed dates", () => {
    expect(isRealCalendarDate("2026-02-30")).toBe(false);
    expect(isRealCalendarDate("2025-02-29")).toBe(false); // non-leap year
    expect(isRealCalendarDate("2026-13-01")).toBe(false);
    expect(isRealCalendarDate("2026-2-3")).toBe(false); // needs zero-padding
    expect(isRealCalendarDate("not-a-date")).toBe(false);
    expect(isRealCalendarDate("")).toBe(false);
  });
});

describe("normalizeEvents", () => {
  it("returns [] for a non-array", () => {
    expect(normalizeEvents(null)).toEqual([]);
    expect(normalizeEvents({})).toEqual([]);
  });

  it("drops entries without an event_type", () => {
    expect(normalizeEvents([{ due_date: "2026-01-01" }, null, "x"])).toEqual([]);
  });

  it("nulls out an invalid due_date but keeps the event", () => {
    const [e] = normalizeEvents([
      { event_type: "支払期日", due_date: "2026-02-30" },
    ]);
    expect(e.event_type).toBe("支払期日");
    expect(e.due_date).toBeNull();
  });

  it("defaults notify_lead_days to 14 and clamps/rounds it", () => {
    expect(normalizeEvents([{ event_type: "x" }])[0].notify_lead_days).toBe(14);
    expect(
      normalizeEvents([{ event_type: "x", notify_lead_days: "nope" }])[0]
        .notify_lead_days,
    ).toBe(14);
    expect(
      normalizeEvents([{ event_type: "x", notify_lead_days: 3.7 }])[0]
        .notify_lead_days,
    ).toBe(4);
    expect(
      normalizeEvents([{ event_type: "x", notify_lead_days: -5 }])[0]
        .notify_lead_days,
    ).toBe(0);
  });
});

describe("normalizeFields", () => {
  it("returns {} for non-objects and arrays", () => {
    expect(normalizeFields(null)).toEqual({});
    expect(normalizeFields([1, 2])).toEqual({});
  });

  it("keeps numbers, trims strings, and drops empty/null values", () => {
    expect(
      normalizeFields({ amount: 1000, name: "  田中  ", note: "", missing: null }),
    ).toEqual({ amount: 1000, name: "田中" });
  });
});

describe("parseAnalysis", () => {
  it("parses a well-formed JSON object", () => {
    const r = parseAnalysis(
      JSON.stringify({
        doc_type: "請求書",
        title: "電気料金",
        fields: { amount: 5000 },
        keywords: ["電気", 42, null, { x: 1 }, "料金"],
        confidence: 0.9,
      }),
      "gemini-test",
    );
    expect(r.doc_type).toBe("請求書");
    expect(r.title).toBe("電気料金");
    expect(r.fields).toEqual({ amount: 5000 });
    // toStr coerces numbers to strings but drops null/objects (→ null → filtered).
    expect(r.keywords).toEqual(["電気", "42", "料金"]);
    expect(r.confidence).toBe(0.9);
    expect(r.model).toBe("gemini-test");
    expect(r.is_stub).toBe(false);
  });

  it("strips a ```json code fence before parsing", () => {
    const r = parseAnalysis('```json\n{"doc_type":"領収書"}\n```', "m");
    expect(r.doc_type).toBe("領収書");
  });

  it("falls back to defaults for non-object JSON", () => {
    const r = parseAnalysis("null", "m");
    expect(r.doc_type).toBe("不明");
    expect(r.title).toBe("無題の書類");
    expect(r.fields).toEqual({});
    expect(r.keywords).toEqual([]);
    expect(r.events).toEqual([]);
  });

  it("defaults a missing/garbled confidence to the escalation threshold (no escalation)", () => {
    expect(parseAnalysis("{}", "m").confidence).toBe(ESCALATION_THRESHOLD);
    expect(parseAnalysis("not json", "m").confidence).toBe(ESCALATION_THRESHOLD);
  });

  it("clamps a returned confidence into [0, 1]", () => {
    expect(parseAnalysis('{"confidence": 5}', "m").confidence).toBe(1);
    expect(parseAnalysis('{"confidence": -3}', "m").confidence).toBe(0);
  });
});
