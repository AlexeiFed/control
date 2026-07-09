import { describe, expect, it } from "vitest";
import { sessionCookieName } from "../../src/lib/auth/session";

describe("session constants", () => {
  it("uses erp_session as the logout/login cookie name", () => {
    expect(sessionCookieName).toBe("erp_session");
  });
});
