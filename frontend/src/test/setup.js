/* global process */
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Unmount rendered components between tests so one test cannot leak into the next
afterEach(() => { cleanup(); });

// Run every test as if the visitor were in Los Angeles (behind UTC). Date bugs show up for people west of UTC,
// so tests that pass here prove a date does not move a day for them.
process.env.TZ = "America/Los_Angeles";