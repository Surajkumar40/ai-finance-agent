import { describe, it, expect } from "vitest";
import { busiestWeekday, weekdayIndex, weekdaySpend } from "./weekday";

describe("weekdayIndex", () => {
  it("Monday is 0 and Sunday is 6", () => {
    expect(weekdayIndex("2025-01-06")).toBe(0); // Monday
    expect(weekdayIndex("2025-01-12")).toBe(6); // Sunday
    expect(weekdayIndex("2024-02-29")).toBe(3); // Thursday
  });
  it("is not moved by the time zone", () => {
    // tests run in America/Los_Angeles, where new Date("2025-01-06") would be Sunday
    expect(weekdayIndex("2025-01-06")).toBe(0);
  });
});

describe("weekdaySpend", () => {
  it("always returns seven rows, Monday first", () => {
    const rows = weekdaySpend([]);
    expect(rows.map((r) => r.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(rows.every((r) => r.total === 0 && r.avg === 0)).toBe(true);
    expect(weekdaySpend(undefined)).toHaveLength(7);
  });
  it("totals and averages per weekday", () => {
    const rows = weekdaySpend([
      { date: "2025-01-06", amount: 100 }, // Mon
      { date: "2025-01-13", amount: 300 }, // Mon
      { date: "2025-01-07", amount: 50 },  // Tue
      { date: "2025-01-08", amount: 0 },   // Wed, a no-spend day still counts as a day
    ]);
    expect(rows[0]).toMatchObject({ total: 400, count: 2, avg: 200 });
    expect(rows[1]).toMatchObject({ total: 50, count: 1, avg: 50 });
    expect(rows[2]).toMatchObject({ total: 0, count: 1, avg: 0 });
  });
  it("leaves out days that have not happened yet", () => {
    const rows = weekdaySpend([
      { date: "2025-01-06", amount: 100 },
      { date: "2025-01-13", amount: 0, future: true },
    ]);
    expect(rows[0]).toMatchObject({ count: 1, avg: 100 });
  });
  it("rounds to paise and survives bad amounts", () => {
    const rows = weekdaySpend([{ date: "2025-01-06", amount: "10.005" }, { date: "2025-01-13", amount: "abc" }]);
    expect(Number.isFinite(rows[0].avg)).toBe(true);
    expect(rows[0].count).toBe(2);
  });
});

describe("busiestWeekday", () => {
  it("picks the highest average, not the highest total", () => {
    const rows = weekdaySpend([
      { date: "2025-01-06", amount: 100 }, { date: "2025-01-13", amount: 100 }, { date: "2025-01-20", amount: 100 }, // Mon total 300 avg 100
      { date: "2025-01-11", amount: 250 }, // Sat total 250 avg 250
    ]);
    expect(busiestWeekday(rows).label).toBe("Sat");
  });
  it("is null when nothing was spent", () => {
    expect(busiestWeekday(weekdaySpend([{ date: "2025-01-06", amount: 0 }]))).toBeNull();
  });
});