const { calculateHealthScore } = require("../services/healthScore");

describe("calculateHealthScore", () => {
  test("returns null score when there is no data at all", () => {
    const { score, breakdown } = calculateHealthScore({
      income: 0, expenses: 0, budgets: [], monthlyExpenseHistory: [], recurring: [],
    });
    expect(score).toBeNull();
    expect(breakdown.savingsRate.skipped).toBe(true);
    expect(breakdown.budgetAdherence.skipped).toBe(true);
    expect(breakdown.recurringCoverage.skipped).toBe(true);
  });

  test("awards full savings-rate points at or above the 20% target", () => {
    const { breakdown } = calculateHealthScore({
      income: 10000, expenses: 8000, // 20% saved
      budgets: [], monthlyExpenseHistory: [], recurring: [],
    });
    expect(breakdown.savingsRate.points).toBeCloseTo(30, 1);
  });

  test("gives zero savings-rate points when spending exceeds income", () => {
    const { breakdown } = calculateHealthScore({
      income: 10000, expenses: 12000,
      budgets: [], monthlyExpenseHistory: [], recurring: [],
    });
    expect(breakdown.savingsRate.points).toBe(0);
  });

  test("scores partial savings rate proportionally", () => {
    const { breakdown } = calculateHealthScore({
      income: 10000, expenses: 9000, // 10% saved => half of the 20% target
      budgets: [], monthlyExpenseHistory: [], recurring: [],
    });
    expect(breakdown.savingsRate.points).toBeCloseTo(15, 1);
  });

  test("budget adherence reflects fraction of categories within limit", () => {
    const { breakdown } = calculateHealthScore({
      income: null, expenses: null,
      budgets: [
        { spent: 100, monthly_limit: 200 }, // within
        { spent: 300, monthly_limit: 200 }, // over
        { spent: 50, monthly_limit: 100 },  // within
      ],
      monthlyExpenseHistory: [], recurring: [],
    });
    // 2 of 3 within limit => 2/3 * 30
    expect(breakdown.budgetAdherence.points).toBeCloseTo(20, 1);
    expect(breakdown.budgetAdherence.withinLimit).toBe(2);
  });

  test("spending consistency rewards low variance vs history", () => {
    const { breakdown } = calculateHealthScore({
      income: null, expenses: 5000,
      budgets: [], monthlyExpenseHistory: [4900, 5100, 5000], recurring: [],
    });
    expect(breakdown.spendingConsistency.points).toBeGreaterThan(15);
  });

  test("spending consistency penalizes a big swing vs history", () => {
    const { breakdown } = calculateHealthScore({
      income: null, expenses: 10000,
      budgets: [], monthlyExpenseHistory: [4000, 4200, 4100], recurring: [],
    });
    expect(breakdown.spendingConsistency.points).toBeLessThan(5);
  });

  test("recurring coverage flags overdue bills", () => {
    const now = new Date("2026-07-14");
    const { breakdown } = calculateHealthScore({
      income: null, expenses: null, budgets: [], monthlyExpenseHistory: [],
      recurring: [
        { next_due: "2026-08-01", is_active: true },  // upcoming, fine
        { next_due: "2026-07-01", is_active: true },  // overdue
        { next_due: "2026-01-01", is_active: false }, // inactive, ignored
      ],
      now,
    });
    expect(breakdown.recurringCoverage.total).toBe(2);
    expect(breakdown.recurringCoverage.overdue).toBe(1);
    expect(breakdown.recurringCoverage.points).toBeCloseTo(10, 1);
  });

  test("only counts weight from components that have data (dynamic re-weighting)", () => {
    // Only savings rate has data — it alone should determine the 0-100 score.
    const { score } = calculateHealthScore({
      income: 10000, expenses: 8000, // exactly at target => full 30/30
      budgets: [], monthlyExpenseHistory: [], recurring: [],
    });
    expect(score).toBe(100);
  });
});
