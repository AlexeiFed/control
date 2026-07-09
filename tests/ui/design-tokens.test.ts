import { describe, expect, it } from "vitest";
import { designTokens } from "../../src/lib/design-tokens";

describe("designTokens", () => {
  it("uses a strict light workspace palette with readable dark text", () => {
    expect(designTokens.color.background).toBe("#F3F5F7");
    expect(designTokens.color.surface).toBe("#FFFFFF");
    expect(designTokens.color.surfaceElevated).toBe("#F8FAFC");
    expect(designTokens.color.border).toBe("#CBD5E1");
    expect(designTokens.color.text).toBe("#0F172A");
    expect(designTokens.color.textMuted).toBe("#475569");
  });

  it("keeps action colors restrained and distinct from the neutral workspace palette", () => {
    expect(designTokens.color.accent.primary).toBe("#1E3A5F");
    expect(designTokens.color.accent.primaryHover).toBe("#172F4D");
    expect(designTokens.color.accent.success).toBe("#047857");
    expect(designTokens.color.accent.warning).toBe("#B45309");
    expect(designTokens.color.accent.danger).toBe("#B91C1C");
  });
});
