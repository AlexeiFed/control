import { describe, expect, it } from "vitest";
import { ForbiddenError, assertPermission, hasPermission } from "../../src/lib/auth/rbac";

describe("RBAC", () => {
  it("allows admin to manage users", () => {
    expect(hasPermission("Administrator", "users:manage")).toBe(true);
  });

  it("blocks planner from finance exports and user management", () => {
    expect(hasPermission("Planner", "users:manage")).toBe(false);
    expect(hasPermission("Planner", "timesheet:read")).toBe(true);
    expect(hasPermission("Planner", "holidays:read")).toBe(true);
    expect(hasPermission("Planner", "holidays:manage")).toBe(false);
  });

  it("allows accountant to read schedules and split financial exports", () => {
    expect(hasPermission("Accountant", "schedule:read")).toBe(true);
    expect(hasPermission("Accountant", "invoice:export")).toBe(true);
    expect(hasPermission("Accountant", "payroll:export")).toBe(true);
    expect(hasPermission("Accountant", "holidays:read")).toBe(true);
    expect(hasPermission("Accountant", "schedule:write")).toBe(false);
  });

  it("blocks planner from financial exports", () => {
    expect(hasPermission("Planner", "invoice:export")).toBe(false);
    expect(hasPermission("Planner", "payroll:export")).toBe(false);
  });

  it("allows administrator to manage holidays", () => {
    expect(hasPermission("Administrator", "holidays:manage")).toBe(true);
    expect(hasPermission("Administrator", "holidays:read")).toBe(true);
  });

  it("allows planner to manage shift templates", () => {
    expect(hasPermission("Planner", "scheduleTemplates:manage")).toBe(true);
    expect(hasPermission("Accountant", "scheduleTemplates:manage")).toBe(false);
  });

  it("restricts rate rules to administrator for management and allows accountant read", () => {
    expect(hasPermission("Administrator", "rates:manage")).toBe(true);
    expect(hasPermission("Administrator", "rates:read")).toBe(true);
    expect(hasPermission("Accountant", "rates:read")).toBe(true);
    expect(hasPermission("Accountant", "rates:manage")).toBe(false);
    expect(hasPermission("Planner", "rates:read")).toBe(false);
    expect(hasPermission("Planner", "rates:manage")).toBe(false);
  });

  it("throws a typed forbidden error for missing permissions", () => {
    expect(() => assertPermission("Planner", "users:manage")).toThrow(ForbiddenError);
  });

  it("restricts curator payroll to administrator", () => {
    expect(hasPermission("Administrator", "curators:manage")).toBe(true);
    expect(hasPermission("Planner", "curators:manage")).toBe(false);
    expect(hasPermission("Accountant", "curators:manage")).toBe(false);
  });

  it("allows admin and planner to issue advances; accountant read-only", () => {
    expect(hasPermission("Administrator", "advances:manage")).toBe(true);
    expect(hasPermission("Administrator", "advances:read")).toBe(true);
    expect(hasPermission("Planner", "advances:manage")).toBe(true);
    expect(hasPermission("Planner", "advances:read")).toBe(true);
    expect(hasPermission("Accountant", "advances:manage")).toBe(false);
    expect(hasPermission("Accountant", "advances:read")).toBe(true);
  });
});
