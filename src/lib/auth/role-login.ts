import { createHmac, timingSafeEqual } from "node:crypto";
import { roleLabels, type Role } from "./rbac";
import type { AuthUser } from "./session";

const rolePasswordEnv: Record<Role, string> = {
  Administrator: "ADMINISTRATOR_ROLE_PASSWORD",
  Planner: "PLANNER_ROLE_PASSWORD",
  Accountant: "ACCOUNTANT_ROLE_PASSWORD",
};

export function authenticateRolePassword(role: Role, password: string): AuthUser | null {
  const expectedPassword = getRolePassword(role);

  if (!expectedPassword || !password || !secureCompare(password, expectedPassword)) {
    return null;
  }

  return createRoleUser(role);
}

export function createRoleUser(role: Role): AuthUser {
  return {
    id: `role:${role}`,
    name: roleLabels[role],
    role,
    sessionVersion: getRoleCredentialVersion(role),
  };
}

export function getRoleCredentialVersion(role: Role): string {
  const password = getRolePassword(role);

  if (!password) {
    throw new Error(`${rolePasswordEnv[role]} must be set`);
  }

  return createHmac("sha256", getSessionSecret())
    .update(`${role}:${password}`)
    .digest("base64url");
}

export function getSessionSecret(): string {
  const secret = process.env.ERP_SESSION_SECRET;

  if (!secret || secret === "...") {
    throw new Error("ERP_SESSION_SECRET must be set to a real random value");
  }

  return secret;
}

export function isRole(value: unknown): value is Role {
  return value === "Administrator" || value === "Planner" || value === "Accountant";
}

function getRolePassword(role: Role): string | undefined {
  return process.env[rolePasswordEnv[role]];
}

function secureCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) return false;

  return timingSafeEqual(leftBuffer, rightBuffer);
}

