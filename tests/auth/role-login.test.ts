import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  authenticateRolePassword,
  createRoleUser,
  getRoleCredentialVersion,
} from "../../src/lib/auth/role-login";

beforeEach(() => {
  process.env.ERP_SESSION_SECRET = "test-secret-with-enough-entropy";
  process.env.ADMINISTRATOR_ROLE_PASSWORD = "admin-secret";
  process.env.PLANNER_ROLE_PASSWORD = "planner-secret";
  process.env.ACCOUNTANT_ROLE_PASSWORD = "accountant-secret";
});

afterEach(() => {
  delete process.env.ERP_SESSION_SECRET;
  delete process.env.ADMINISTRATOR_ROLE_PASSWORD;
  delete process.env.PLANNER_ROLE_PASSWORD;
  delete process.env.ACCOUNTANT_ROLE_PASSWORD;
});

describe("role login", () => {
  it("authenticates by selected role and role password only", () => {
    expect(authenticateRolePassword("Administrator", "admin-secret")).toMatchObject({
      id: "role:Administrator",
      name: "Администратор",
      role: "Administrator",
    });
    expect(authenticateRolePassword("Planner", "admin-secret")).toBeNull();
    expect(authenticateRolePassword("Planner", "")).toBeNull();
  });

  it("changes credential version when the role password changes", () => {
    const user = createRoleUser("Administrator");
    const firstVersion = getRoleCredentialVersion(user.role);

    process.env.ADMINISTRATOR_ROLE_PASSWORD = "new-admin-secret";

    expect(getRoleCredentialVersion(user.role)).not.toBe(firstVersion);
  });
});
