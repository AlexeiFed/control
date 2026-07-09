import { describe, expect, it } from "vitest";
import { getLandingPath } from "../../src/lib/auth/navigation";

describe("auth navigation", () => {
  it("sends anonymous users to login and authenticated users to dashboard", () => {
    expect(getLandingPath(null)).toBe("/login");
    expect(
      getLandingPath({
        id: "role:Administrator",
        name: "Администратор",
        role: "Administrator",
        sessionVersion: "version",
      }),
    ).toBe("/dashboard");
  });
});
