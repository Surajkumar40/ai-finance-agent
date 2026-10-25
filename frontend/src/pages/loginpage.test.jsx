import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";

vi.mock("../api/axios", () => ({ default: { post: vi.fn(), get: vi.fn() } }));

import api from "../api/axios";
import LoginPage from "./LoginPage";
import { AuthProvider } from "../context/AuthContext";
import { ThemeProvider } from "../context/ThemeContext";
import { mockMatchMedia } from "../test/matchMedia";

function setup() {
  return render(
    <ThemeProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={["/login"]}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/dashboard" element={<p>Dashboard page</p>} />
            <Route path="/signup" element={<p>Signup page</p>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mockMatchMedia();
});

describe("LoginPage", () => {
  it("labels both fields so screen readers and click-to-focus work", () => {
    setup();
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
  });

  it("signs in: sends the form, stores the token, and opens the dashboard", async () => {
    api.post.mockResolvedValue({ data: { token: "abc123", user: { name: "Suraj", email: "s@example.com" } } });
    setup();
    await userEvent.type(screen.getByLabelText("Email"), "s@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "secret-pass");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(api.post).toHaveBeenCalledWith("/auth/login", { email: "s@example.com", password: "secret-pass" });
    expect(await screen.findByText("Dashboard page")).toBeInTheDocument();
    expect(localStorage.getItem("token")).toBe("abc123");
  });

  it("shows the server's message when sign-in fails, and stays on the page", async () => {
    api.post.mockRejectedValue({ response: { data: { message: "Invalid email or password" } } });
    setup();
    await userEvent.type(screen.getByLabelText("Email"), "s@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
    expect(screen.queryByText("Dashboard page")).not.toBeInTheDocument();
    expect(localStorage.getItem("token")).toBeNull();
  });

  it("falls back to a general message when the server gives none", async () => {
    api.post.mockRejectedValue(new Error("Network Error"));
    setup();
    await userEvent.type(screen.getByLabelText("Email"), "s@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Login failed");
  });

  it("shows and hides the password with a button that has an accessible name", async () => {
    setup();
    const field = screen.getByLabelText("Password");
    await userEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(field).toHaveAttribute("type", "text");
    await userEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(field).toHaveAttribute("type", "password");
  });

  it("starts the demo with the visitor's own date and opens the dashboard", async () => {
    api.post.mockResolvedValue({ data: { token: "demo-token", user: { name: "Alex Demo", email: "d@demo.local" } } });
    setup();
    await userEvent.click(screen.getByRole("button", { name: /Try the demo/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/demo", { today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }));
    expect(await screen.findByText("Dashboard page")).toBeInTheDocument();
  });
});