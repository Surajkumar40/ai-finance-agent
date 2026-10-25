import { describe, it, expect } from "vitest";
import { toCSV } from "./csv";

const tx = (over = {}) => ({ date: "2026-10-01", title: "Lunch", type: "expense", category_name: "Food & Dining", amount: 250, note: "", ...over });
const BOM = String.fromCharCode(0xfeff);
const lines = (csv) => (csv.startsWith(BOM) ? csv.slice(1) : csv).split("\r\n");

describe("toCSV", () => {
  it("starts with a byte-order mark so Excel reads ₹ and accents correctly", () => {
    expect(toCSV([tx()]).startsWith("﻿")).toBe(true);
  });

  it("writes a header and one line per transaction, joined with CRLF", () => {
    const out = lines(toCSV([tx(), tx({ title: "Tea" })]));
    expect(out[0]).toBe("Date,Title,Type,Category,Amount,Note");
    expect(out).toHaveLength(3);
  });

  it("keeps the calendar day for someone west of UTC (the tests run as if in Los Angeles)", () => {
    expect(new Date("2026-10-01").getDate()).toBe(30); // the trap: this plain date really does shift here
    expect(lines(toCSV([tx({ date: "2026-10-01" })]))[1].startsWith("2026-10-01,")).toBe(true);
  });

  it("keeps the calendar day: a timestamp is cut to YYYY-MM-DD, never converted through a Date", () => {
    const out = lines(toCSV([tx({ date: "2026-10-01T00:00:00.000Z" })]));
    expect(out[1].startsWith("2026-10-01,")).toBe(true);
  });

  it("formats amounts with two decimals", () => {
    expect(lines(toCSV([tx({ amount: "12.5" })]))[1]).toContain(",12.50,");
  });

  it("leaves a missing category and note empty", () => {
    const row = lines(toCSV([tx({ category_name: undefined, note: undefined })]))[1];
    expect(row).toBe("2026-10-01,Lunch,expense,,250.00,");
  });

  it("quotes values that contain commas, quotes or line breaks", () => {
    const row = lines(toCSV([tx({ title: 'Dinner, "late"', note: "a\nb" })]))[1];
    expect(row).toContain('"Dinner, ""late"""');
    expect(row).toContain('"a\nb"');
  });

  it("stops spreadsheet formula injection by prefixing risky values with an apostrophe", () => {
    const row = lines(toCSV([tx({ title: "=SUM(A1:A9)", note: "@cmd" })]))[1];
    expect(row).toContain("'=SUM(A1:A9)");
    expect(row).toContain("'@cmd");
  });
});