import { describe, it, expect } from "vitest";
import { buildBaseline, simulate, presetTrimAll } from "./whatif";

const TODAY = "2026-10-25";
// 30 days: 60000 income, 30000 spending (20000 rent, 10000 food)
const txns = [
  { date: "2026-10-01", type: "income", amount: 60000 },
  { date: "2026-10-02", type: "expense", amount: 20000, category_id: 1, category_name: "Rent" },
  { date: "2026-10-10", type: "expense", amount: 4000, category_id: 2, category_name: "Food" },
  { date: "2026-10-15", type: "expense", amount: 3000, category_id: 2, category_name: "Food" },
  { date: "2026-10-20", type: "expense", amount: 3000, category_id: 2, category_name: "Food" },
];

describe("buildBaseline", () => {
  it("has nothing to say about an empty history", () => {
    const b = buildBaseline([], TODAY);
    expect(b).toMatchObject({ enough: false, income: 0, expense: 0, categories: [] });
  });
  it("ignores bad rows and anything older than 90 days", () => {
    const b = buildBaseline([...txns, { date: "2025-01-01", type: "expense", amount: 99999, category_id: 9 }, { date: "bad", type: "expense", amount: 5 }, null], TODAY);
    expect(b.expense).toBeCloseTo(30000, 0);
  });
  it("never scales up a history shorter than a month", () => {
    const b = buildBaseline(txns, TODAY);
    expect(b.months).toBeGreaterThanOrEqual(1);
    expect(b.income).toBeLessThanOrEqual(60000);
  });
  it("lists spending by category, biggest first, with shares that add up to 1", () => {
    const b = buildBaseline(txns, TODAY);
    expect(b.categories.map((c) => c.name)).toEqual(["Rent", "Food"]);
    expect(b.categories.reduce((s, c) => s + c.share, 0)).toBeCloseTo(1, 5);
  });
});

describe("simulate", () => {
  const base = buildBaseline(txns, TODAY);
  it("changes nothing when no cuts are given", () => {
    const r = simulate(base, {});
    expect(r.monthlyGain).toBeCloseTo(0, 5);
    expect(r.savingsAfter).toBeCloseTo(r.savingsBefore, 5);
  });
  it("saves the cut amount every month, and more with extra income", () => {
    const foodId = base.categories.find((c) => c.name === "Food").id;
    const cut = simulate(base, { cuts: { [foodId]: -50 } });
    const food = base.categories.find((c) => c.name === "Food").monthly;
    expect(cut.monthlyGain).toBeCloseTo(food / 2, 5);
    expect(simulate(base, { cuts: { [foodId]: -50 }, extraIncome: 1000 }).monthlyGain).toBeCloseTo(food / 2 + 1000, 5);
  });
  it("clamps silly inputs: cuts to -100..100 and the horizon to 1..60 months", () => {
    const rentId = base.categories.find((c) => c.name === "Rent").id;
    expect(simulate(base, { cuts: { [rentId]: -500 } }).perCategory.find((c) => c.name === "Rent").after).toBe(0);
    expect(simulate(base, { horizon: 999 }).months).toBe(60);
    expect(simulate(base, { horizon: -5 }).months).toBeGreaterThanOrEqual(1);
  });
  it("builds a month-by-month series starting at zero", () => {
    const r = simulate(base, { horizon: 6 });
    expect(r.series).toHaveLength(7);
    expect(r.series[0]).toMatchObject({ month: 0, now: 0, scenario: 0 });
  });
  it("shows how much sooner a savings goal is reached", () => {
    const foodId = base.categories.find((c) => c.name === "Food").id;
    const r = simulate(base, { cuts: { [foodId]: -100 } }, [{ id: 1, name: "Trip", remaining: 50000 }]);
    expect(r.goalImpact[0].monthsSooner).toBeGreaterThan(0);
  });
});

describe("presetTrimAll", () => {
  it("returns a negative cut for every category", () => {
    const base = buildBaseline(txns, TODAY);
    const cuts = presetTrimAll(base, 10);
    expect(Object.values(cuts)).toEqual([-10, -10]);
  });
});