import { describe, it, expect } from "vitest";
import { parseSpoken } from "./voiceParse";

const cats = [{ id: 1, name: "Food & Dining" }, { id: 2, name: "Transport" }, { id: 3, name: "Salary" }];
const TODAY = "2026-10-25";
const say = (t) => parseSpoken(t, cats, TODAY);

describe("parseSpoken", () => {
  it("returns nothing for empty speech", () => {
    expect(say("")).toEqual([]);
    expect(say("   ")).toEqual([]);
  });
  it("reads amount, title and 'yesterday' from one sentence", () => {
    expect(say("spent 450 on groceries yesterday")[0]).toMatchObject({ title: "Groceries", amount: 450, type: "expense", date: "2026-10-24" });
  });
  it("uses today when no day is said", () => {
    expect(say("spent 450 on groceries")[0].date).toBe(TODAY);
  });
  it("understands numbers said in words", () => {
    expect(say("two hundred and fifty on chai")[0].amount).toBe(250);
  });
  it("understands shorthand such as 1.5k", () => {
    expect(say("spent rs 1.5k on petrol")[0].amount).toBe(1500);
  });
  it("splits one sentence into several transactions", () => {
    const items = say("paid 1200 for uber and 300 for lunch");
    expect(items.map((i) => [i.title, i.amount])).toEqual([["Uber", 1200], ["Lunch", 300]]);
  });
  it("marks received money as income", () => {
    expect(say("received salary of 50000")[0]).toMatchObject({ type: "income", amount: 50000, category_id: 3 });
  });
  it("picks a matching category from the person's own list", () => {
    expect(say("paid 1200 for uber")[0].category_id).toBe(2);
  });
});