import { describe, it, expect } from "vitest";
import { parseCSV, findHeaderRow, guessMapping, parseDate, parseAmount, buildRows, applyKnownCategories } from "./importCsv";

describe("parseCSV", () => {
  it("reads quoted cells, escaped quotes and commas inside quotes", () => {
    expect(parseCSV('a,b\n"x, y","say ""hi"""')).toEqual([["a", "b"], ["x, y", 'say "hi"']]);
  });
  it("detects semicolon and tab separated files", () => {
    expect(parseCSV("a;b;c\n1;2;3")[1]).toEqual(["1", "2", "3"]);
    expect(parseCSV("a\tb\n1\t2")[1]).toEqual(["1", "2"]);
  });
  it("drops a byte-order mark and blank lines, and handles Windows line endings", () => {
    expect(parseCSV("﻿a,b\r\n\r\n1,2\r\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("findHeaderRow / guessMapping", () => {
  const rows = [
    ["Account Statement"],
    ["Customer", "Suraj"],
    ["Date", "Narration", "Withdrawal Amt", "Deposit Amt", "Balance"],
    ["01/10/2026", "UPI Zomato", "250", "", "9750"],
  ];
  it("skips the account information lines that banks put above the table", () => {
    expect(findHeaderRow(rows)).toBe(2);
  });
  it("finds date, description and the debit/credit pair, and never mistakes the balance column", () => {
    const m = guessMapping(rows[2]);
    expect(m).toMatchObject({ date: 0, desc: 1, debit: 2, credit: 3, amount: -1 });
  });
  it("uses a single amount column when there is no debit/credit pair", () => {
    expect(guessMapping(["Date", "Description", "Amount"])).toMatchObject({ date: 0, desc: 1, amount: 2, debit: -1, credit: -1 });
  });
});

describe("parseDate", () => {
  it("accepts ISO dates and strips a time", () => {
    expect(parseDate("2026-10-01")).toBe("2026-10-01");
    expect(parseDate("2026-10-01T14:30:00Z")).toBe("2026-10-01");
  });
  it("reads 03/04/2026 as 3 April by default and as 4 March when month comes first", () => {
    expect(parseDate("03/04/2026")).toBe("2026-04-03");
    expect(parseDate("03/04/2026", false)).toBe("2026-03-04");
  });
  it("is certain when one part is above 12", () => {
    expect(parseDate("25/04/2026", false)).toBe("2026-04-25");
    expect(parseDate("04/25/2026")).toBe("2026-04-25");
  });
  it("reads month names and two-digit years", () => {
    expect(parseDate("15 Oct 2026")).toBe("2026-10-15");
    expect(parseDate("Oct 15, 2026")).toBe("2026-10-15");
    expect(parseDate("15/10/26")).toBe("2026-10-15");
  });
  it("rejects dates that do not exist and text that is not a date", () => {
    expect(parseDate("31/02/2026")).toBeNull();
    expect(parseDate("hello")).toBeNull();
    expect(parseDate("")).toBeNull();
    expect(parseDate(null)).toBeNull();
  });
});

describe("parseAmount", () => {
  it("strips currency symbols and thousands separators", () => {
    expect(parseAmount("₹1,25,847.50")).toBe(125847.5);
    expect(parseAmount("Rs. 500")).toBe(500);
  });
  it("understands the different ways banks write a negative", () => {
    expect(parseAmount("-500")).toBe(-500);
    expect(parseAmount("(500)")).toBe(-500);
    expect(parseAmount("500-")).toBe(-500);
    expect(parseAmount("500 Dr")).toBe(-500);
    expect(parseAmount("500 Cr")).toBe(500);
  });
  it("returns null for anything that is not a number", () => {
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("12.3.4")).toBeNull();
  });
});

describe("buildRows", () => {
  const map = { date: 0, desc: 1, debit: 2, credit: 3, amount: -1, type: -1, category: -1 };
  it("turns a debit into an expense and a credit into income", () => {
    const { rows, problems } = buildRows([["01/10/2026", "Zomato", "250", ""], ["02/10/2026", "Salary", "", "50000"]], map);
    expect(problems).toHaveLength(0);
    expect(rows[0]).toMatchObject({ date: "2026-10-01", title: "Zomato", amount: 250, type: "expense" });
    expect(rows[1]).toMatchObject({ date: "2026-10-02", type: "income", amount: 50000 });
  });
  it("uses the sign of a single amount column, or flips it for card statements", () => {
    const one = { date: 0, desc: 1, amount: 2, debit: -1, credit: -1, type: -1, category: -1 };
    expect(buildRows([["2026-10-01", "Shop", "-100"]], one).rows[0].type).toBe("expense");
    expect(buildRows([["2026-10-01", "Shop", "100"]], one, { positiveIsExpense: true }).rows[0].type).toBe("expense");
  });
  it("reports rows it cannot use instead of dropping them silently", () => {
    const { rows, problems } = buildRows([["not a date", "X", "5", ""], ["01/10/2026", "Y", "", ""]], map);
    expect(rows).toHaveLength(0);
    expect(problems.map((p) => p.reason)).toEqual(["No valid date", "No amount"]);
  });
  it("gives a blank description a sensible title", () => {
    expect(buildRows([["01/10/2026", "", "10", ""]], map).rows[0].title).toBe("Expense");
  });
});

describe("applyKnownCategories", () => {
  const categories = [{ id: 1, name: "Food & Dining" }, { id: 2, name: "Transport" }];
  const history = [
    { title: "Uber ride 123", category_id: 2 },
    { title: "Uber ride 456", category_id: 2 },
    { title: "Uber ride 789", category_id: 1 },
  ];
  it("prefers the category written in the file", () => {
    const rows = [{ title: "Uber", csv_category: "food & dining" }];
    expect(applyKnownCategories(rows, categories, history)[0].category_id).toBe(1);
  });
  it("otherwise copies the category the person used most often for the same title", () => {
    const rows = [{ title: "Uber ride 999", csv_category: "" }];
    expect(applyKnownCategories(rows, categories, history)[0].category_id).toBe(2);
  });
  it("leaves the category empty when there is nothing to go on", () => {
    const rows = [{ title: "Unknown shop", csv_category: "" }];
    expect(applyKnownCategories(rows, categories, history)[0].category_id).toBeNull();
  });
});