const { isAnomalous, MIN_BASELINE_SAMPLES, ANOMALY_MULTIPLIER } = require("../services/anomalyDetection");

describe("isAnomalous", () => {
  test("flags an amount more than 2x the baseline average", () => {
    expect(isAnomalous(500, 200, 5)).toBe(true); // 500 > 200*2
  });

  test("does not flag an amount within normal range", () => {
    expect(isAnomalous(250, 200, 5)).toBe(false);
  });

  test("does not flag anything until the baseline has enough samples", () => {
    // Would be a 3x spike, but only 2 prior transactions exist in this category.
    expect(isAnomalous(600, 200, MIN_BASELINE_SAMPLES - 1)).toBe(false);
  });

  test("flags right at the sample threshold once amount clears the multiplier", () => {
    expect(isAnomalous(200 * ANOMALY_MULTIPLIER + 1, 200, MIN_BASELINE_SAMPLES)).toBe(true);
  });

  test("does not flag exactly at the multiplier boundary (must exceed, not equal)", () => {
    expect(isAnomalous(200 * ANOMALY_MULTIPLIER, 200, MIN_BASELINE_SAMPLES)).toBe(false);
  });

  test("treats a zero or negative baseline as not anomalous (insufficient signal)", () => {
    expect(isAnomalous(500, 0, MIN_BASELINE_SAMPLES)).toBe(false);
  });
});
