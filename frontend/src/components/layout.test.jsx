import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

vi.mock("../api/axios", () => ({ default: { get: vi.fn(() => Promise.resolve({ data: {} })), post: vi.fn() } }));
vi.mock("./NotificationBell", () => ({ default: () => <span>bell</span> }));

import Layout from "./Layout";
import { AuthProvider } from "../context/AuthContext";
import { ThemeProvider } from "../context/ThemeContext";
import { mockMatchMedia } from "../test/matchMedia";

function setup(width = "phone") {
  mockMatchMedia({ desktop: width === "desktop" });
  localStorage.setItem("token", "t");
  localStorage.setItem("user", JSON.stringify({ name: "Suraj Kumar", email: "s@example.com" }));
  return render(
    <ThemeProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={["/budgets"]}>
          <Layout><h1>Page content</h1></Layout>
        </MemoryRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

beforeEach(() => { localStorage.clear(); });

describe("Layout", () => {
  it("gives keyboard users a skip link and one main landmark", () => {
    setup("desktop");
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#main");
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
    expect(screen.getByText("Page content")).toBeInTheDocument();
  });

  it("groups the navigation and marks the current page", () => {
    setup("desktop");
    for (const name of ["Overview", "Plan", "Insight"]) expect(screen.getByText(name)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Budgets" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });

  it("keeps the phone menu out of reach while it is closed", () => {
    setup("phone");
    expect(document.getElementById("sidebar")).toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveAttribute("aria-expanded", "false");
  });

  it("never hides the sidebar on a wide screen", () => {
    setup("desktop");
    expect(document.getElementById("sidebar")).not.toHaveAttribute("inert");
  });

  it("opens the phone menu as a dialog, moves focus into it and stops the page behind from scrolling", async () => {
    setup("phone");
    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const dialog = screen.getByRole("dialog", { name: "Main menu" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).not.toHaveAttribute("inert");
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("closes on Escape, gives focus back to the menu button and lets the page scroll again", async () => {
    setup("phone");
    const button = screen.getByRole("button", { name: "Open menu" });
    await userEvent.click(button);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(button).toHaveFocus();
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("keeps Tab inside the open menu", async () => {
    setup("phone");
    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const dialog = screen.getByRole("dialog");
    for (let i = 0; i < 40; i++) {
      await userEvent.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it("switches the theme with a button that reports its state", async () => {
    setup("desktop");
    const toggle = screen.getByRole("button", { name: /Dark mode/ });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: /Light mode/ })).toHaveAttribute("aria-pressed", "true");
  });
});