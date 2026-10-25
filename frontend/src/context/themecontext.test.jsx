import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, useTheme } from "./ThemeContext";
import { mockMatchMedia } from "../test/matchMedia";

function Probe() {
  const { dark, toggle } = useTheme();
  return <button onClick={toggle}>{dark ? "dark" : "light"}</button>;
}
const renderTheme = () => render(<ThemeProvider><Probe /></ThemeProvider>);
const isDarkClass = () => document.documentElement.classList.contains("dark");

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
  document.documentElement.removeAttribute("style");
  document.head.innerHTML = '<meta name="theme-color" content="#f6f5f1">';
});

describe("ThemeProvider", () => {
  it("starts light when the device prefers light and nothing is saved", () => {
    mockMatchMedia({ dark: false });
    renderTheme();
    expect(screen.getByRole("button")).toHaveTextContent("light");
    expect(isDarkClass()).toBe(false);
  });

  it("starts dark when the device prefers dark, without saving that guess", () => {
    mockMatchMedia({ dark: true });
    renderTheme();
    expect(screen.getByRole("button")).toHaveTextContent("dark");
    expect(isDarkClass()).toBe(true);
    expect(localStorage.getItem("theme")).toBeNull();
  });

  it("a saved choice beats the device preference", () => {
    mockMatchMedia({ dark: true });
    localStorage.setItem("theme", "light");
    renderTheme();
    expect(screen.getByRole("button")).toHaveTextContent("light");
  });

  it("toggling switches the page, the browser colour scheme and the phone address-bar colour, and saves the choice", async () => {
    mockMatchMedia({ dark: false });
    renderTheme();
    await userEvent.click(screen.getByRole("button"));
    expect(isDarkClass()).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(document.querySelector('meta[name="theme-color"]').getAttribute("content")).toBe("#141413");
    expect(localStorage.getItem("theme")).toBe("dark");
  });

  it("follows the device when it changes, until the person has chosen", () => {
    const media = mockMatchMedia({ dark: false });
    renderTheme();
    act(() => media.set({ dark: true }));
    expect(isDarkClass()).toBe(true);
  });

  it("stops following the device once the person has chosen", async () => {
    const media = mockMatchMedia({ dark: false });
    renderTheme();
    await userEvent.click(screen.getByRole("button")); // chooses dark
    await userEvent.click(screen.getByRole("button")); // chooses light
    act(() => media.set({ dark: true }));
    expect(isDarkClass()).toBe(false);
  });
});