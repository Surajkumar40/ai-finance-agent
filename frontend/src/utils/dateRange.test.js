import { describe, it, expect } from "vitest";
import { customRange, dayOf, inRange, isRealDay, nextDay, rangeFor } from "./dateRange";

describe("nextDay", () => {
  it("rolls over month, year and leap day", () => {
    expect(nextDay("2025-01-31")).toBe("2025-02-01");
    expect(nextDay("2025-12-31")).toBe("2026-01-01");
    expect(nextDay("2024-02-28")).toBe("2024-02-29");
    expect(nextDay("2025-02-28")).toBe("2025-03-01");
  });
});

describe("isRealDay", () => {
  it("accepts real days and rejects the rest", () => {
    expect(isRealDay("2024-02-29")).toBe(true);
    expect(isRealDay("2025-02-29")).toBe(false);
    expect(isRealDay("2025-13-01")).toBe(false);
    expect(isRealDay("")).toBe(false);
    expect(isRealDay("01-02-2025")).toBe(false);
    expect(isRealDay(undefined)).toBe(false);
  });
});

describe("customRange", () => {
  it("returns null when nothing is picked", () => {
    expect(customRange("", "")).toBeNull();
    expect(customRange(undefined, undefined)).toBeNull();
  });
  it("includes the last day picked", () => {
    const r = customRange("2025-04-01", "2025-04-30");
    expect(inRange("2025-04-30", r)).toBe(true);
    expect(inRange("2025-04-30T18:30:00.000Z", r)).toBe(true);
    expect(inRange("2025-05-01", r)).toBe(false);
    expect(inRange("2025-03-31", r)).toBe(false);
  });
  it("one day only", () => {
    const r = customRange("2025-04-10", "2025-04-10");
    expect(inRange("2025-04-10", r)).toBe(true);
    expect(inRange("2025-04-11", r)).toBe(false);
    expect(inRange("2025-04-09", r)).toBe(false);
  });
  it("open ended on either side", () => {
    expect(inRange("2030-01-01", customRange("2025-04-01", ""))).toBe(true);
    expect(inRange("2025-03-31", customRange("2025-04-01", ""))).toBe(false);
    expect(inRange("1999-01-01", customRange("", "2025-04-30"))).toBe(true);
    expect(inRange("2025-05-01", customRange("", "2025-04-30"))).toBe(false);
  });
  it("flags a start after the end, and then does not hide rows", () => {
    const r = customRange("2025-05-01", "2025-04-01");
    expect(r.error).toMatch(/after/);
    expect(inRange("2025-04-15", r)).toBe(true);
  });
  it("ignores a half typed date", () => {
    expect(customRange("2025-04", "")).toBeNull();
  });
});

describe("rangeFor", () => {
  const now = new Date(2025, 0, 15); // 15 Jan 2025, local
  it("this and last month, across a year boundary", () => {
    expect(rangeFor("month", now)).toEqual({ start: "2025-01-01", end: "2025-02-01" });
    expect(rangeFor("last", now)).toEqual({ start: "2024-12-01", end: "2025-01-01" });
  });
  it("last 90 days includes today", () => {
    const r = rangeFor("90", now);
    expect(inRange("2025-01-15", r)).toBe(true);
    expect(inRange("2025-01-16", r)).toBe(false);
    expect(inRange("2024-10-17", r)).toBe(true);
    expect(inRange("2024-10-15", r)).toBe(false);
  });
  it("this year", () => {
    expect(rangeFor("year", now)).toEqual({ start: "2025-01-01", end: "2026-01-01" });
  });
  it("all time has no range, custom uses the dates given", () => {
    expect(rangeFor("all", now)).toBeNull();
    expect(rangeFor("custom", now, { from: "2025-02-01", to: "2025-02-03" })).toEqual({ start: "2025-02-01", end: "2025-02-04" });
  });
});

describe("dayOf", () => {
  it("keeps the first ten characters", () => {
    expect(dayOf("2025-04-30T18:30:00.000Z")).toBe("2025-04-30");
  });
});