import { describe, expect, it } from "vitest";
import { buttonVariants } from "../../src/components/ui/button";

describe("buttonVariants", () => {
  it("uses the strict primary action style by default", () => {
    const className = buttonVariants();

    expect(className).toContain("rounded-button");
    expect(className).toContain("bg-accent-primary");
    expect(className).toContain("hover:bg-accent-primary-hover");
    expect(className).toContain("font-semibold");
  });

  it("keeps secondary actions bordered and neutral", () => {
    const className = buttonVariants({ variant: "secondary", size: "sm" });

    expect(className).toContain("border-app-border");
    expect(className).toContain("bg-app-elevated");
    expect(className).toContain("h-9");
  });
});
