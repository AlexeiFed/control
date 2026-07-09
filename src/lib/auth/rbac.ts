export type Role = "Administrator" | "Planner" | "Accountant";

export type Permission =
  | "users:manage"
  | "objects:manage"
  | "guards:manage"
  | "holidays:manage"
  | "holidays:read"
  | "scheduleTemplates:manage"
  | "rates:manage"
  | "rates:read"
  | "schedule:read"
  | "schedule:write"
  | "timesheet:read"
  | "invoice:export"
  | "payroll:export"
  | "analytics:read"
  | "system:health"
  | "curators:manage"
  | "advances:manage"
  | "advances:read";

export const roleLabels: Record<Role, string> = {
  Administrator: "Администратор",
  Planner: "Планировщик",
  Accountant: "Бухгалтер",
};

export const roleDescriptions: Record<Role, string> = {
  Administrator: "Полный доступ к системе, пользователям, объектам и отчётам.",
  Planner: "Объекты, охранники, график и табель без финансовых экспортов и управления пользователями.",
  Accountant: "Табель, статистика, расчёт часов и read-only доступ к графику.",
};

export const roles = ["Administrator", "Planner", "Accountant"] as const satisfies readonly Role[];

const rolePermissions = {
  Administrator: [
    "users:manage",
    "objects:manage",
    "guards:manage",
    "holidays:manage",
    "holidays:read",
    "scheduleTemplates:manage",
    "rates:manage",
    "rates:read",
    "schedule:read",
    "schedule:write",
    "timesheet:read",
    "invoice:export",
    "payroll:export",
    "analytics:read",
    "system:health",
    "curators:manage",
    "advances:manage",
    "advances:read",
  ],
  Planner: [
    "objects:manage",
    "guards:manage",
    "holidays:read",
    "scheduleTemplates:manage",
    "schedule:read",
    "schedule:write",
    "timesheet:read",
    "advances:manage",
    "advances:read",
  ],
  Accountant: [
    "schedule:read",
    "holidays:read",
    "rates:read",
    "timesheet:read",
    "invoice:export",
    "payroll:export",
    "analytics:read",
    "advances:read",
  ],
} as const satisfies Record<Role, readonly Permission[]>;

export function hasPermission(role: Role, permission: Permission): boolean {
  return (rolePermissions[role] as readonly Permission[]).includes(permission);
}

export function assertPermission(role: Role, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new ForbiddenError(role, permission);
  }
}

export class ForbiddenError extends Error {
  constructor(role: Role, permission: Permission) {
    super(`Role ${role} does not have permission ${permission}`);
    this.name = "ForbiddenError";
  }
}
