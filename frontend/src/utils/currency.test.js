import { describe, it, expect, afterEach } from "vitest";
import { fmt, symbol, compact, setCurrency, resetCurrency, getCurrency } from "./currency";

afterEach(() => resetCurrency());

describe("currency", () => {
  it("defaults to rupees with Indian digit grouping", () => {
    expect(getCurrency()).toBe("INR");
    expect(fmt(125847)).toBe("₹1,25,847");
  });

  it("controls decimals with the second and third arguments", () => {
    expect(fmt(1234.5)).toBe("₹1,235");
    expect(fmt(1234.5, 2)).toBe("₹1,234.5");
    expect(fmt(1234.5, 2, 2)).toBe("₹1,234.50");
  });

  it("treats empty or non-numeric input as zero instead of printing NaN", () => {
    expect(fmt("abc")).toBe("₹0");
    expect(fmt(undefined)).toBe("₹0");
  });

  it("switches the symbol and grouping without converting the number", () => {
    setCurrency("USD");
    expect(fmt(1234.5, 2, 2)).toBe("$1,234.50");
    expect(symbol()).toBe("$");
  });

  it("ignores a currency it does not know", () => {
    setCurrency("XYZ");
    expect(getCurrency()).toBe("INR");
  });

  it("remembers the choice and forgets it on reset (sign-out)", () => {
    setCurrency("EUR");
    expect(localStorage.getItem("currency")).toBe("EUR");
    resetCurrency();
    expect(localStorage.getItem("currency")).toBeNull();
    expect(getCurrency()).toBe("INR");
  });

  it("shortens rupee amounts for chart axes (k, L, Cr)", () => {
    expect(compact(950)).toBe("₹950");
    expect(compact(1500)).toBe("₹1.5k");
    expect(compact(25000)).toBe("₹25k");
    expect(compact(250000)).toBe("₹2.5L");
    expect(compact(30000000)).toBe("₹3Cr");
  });

  it("keeps the minus sign in front of a short negative amount", () => {
    expect(compact(-250000)).toBe("-₹2.5L");
  });
});