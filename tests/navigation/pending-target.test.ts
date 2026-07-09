import { describe, expect, it } from "vitest";
import { isPendingNavigationTarget } from "../../src/lib/navigation/pending-target";

describe("isPendingNavigationTarget", () => {
  it("starts pending state for internal route changes", () => {
    expect(isPendingNavigationTarget("/dashboard", "/admin/holidays")).toBe(true);
    expect(isPendingNavigationTarget("/scheduler", "/scheduler?week=2026-05-11")).toBe(true);
  });

  it("ignores anchors, downloads, external links, and the current URL", () => {
    expect(isPendingNavigationTarget("/dashboard", "/dashboard")).toBe(false);
    expect(isPendingNavigationTarget("/dashboard", "#top")).toBe(false);
    expect(isPendingNavigationTarget("/dashboard", "/dashboard#top")).toBe(false);
    expect(isPendingNavigationTarget("/dashboard", "https://example.com")).toBe(false);
    expect(isPendingNavigationTarget("/dashboard", "mailto:test@example.com")).toBe(false);
  });
});
