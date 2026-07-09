# Security ERP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private Next.js ERP for a security company with closed-loop authentication, RBAC, scheduling conflict prevention, guard logs, and payroll-ready hour accounting.

**Architecture:** Next.js App Router owns UI and server routes. Authorization is enforced by shared server-safe RBAC helpers before every protected page/action/query; Zustand mirrors the current user role only for client UX. Scheduling and accounting logic lives in isolated TypeScript modules with unit tests before UI wiring.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS, Zustand, Framer Motion, Lucide Icons, secure session cookies, Argon2id or bcrypt password hashing.

---

## Decisions Locked For V1

- No public registration route.
- Login for V1 is role/password only: select `Administrator`, `Planner`, or `Accountant`, then enter the matching role password from `.env`.
- Do not require email on the login page.
- First managed admin can be seeded by script for the user-management dashboard.
- Later managed users are created only by `Administrator`.
- Roles are `Administrator`, `Planner`, `Accountant`.
- Guard statuses are `Active`, `Sick`, `OnVacation`, `Inactive`.
- Day window is `08:00-20:00`; night window is `20:00-08:00`.
- Holiday minutes are counted independently from night minutes. A minute can be both `night` and `holiday`.
- `Planner` can create/update objects, guards, schedules, and shift logs, but cannot access users or finance.
- `Accountant` can read schedules and fully access timesheets/statistics/exports, but cannot mutate schedules.

---

## Target File Structure

```text
src/
  app/
    (auth)/
      login/page.tsx
    admin/
      users/page.tsx
    api/
      admin/users/route.ts
    dashboard/page.tsx
  components/
    auth/auth-wrapper.tsx
    admin/user-management-dashboard.tsx
  lib/
    auth/password.ts
    auth/rbac.ts
    auth/role-login.ts
    auth/session.ts
    design-tokens.ts
    scheduling/conflicts.ts
    scheduling/hour-calculator.ts
    scheduling/types.ts
  store/current-user-store.ts
  scripts/seed-admin.ts
tests/
  auth/rbac.test.ts
  scheduling/conflicts.test.ts
  scheduling/hour-calculator.test.ts
```

---

## Task 1: Project Baseline And Design Tokens

**Files:**
- Create: `src/lib/design-tokens.ts`
- Modify: `tailwind.config.ts`

- [ ] **Step 1: Create tokens**

```typescript
export const designTokens = {
  color: {
    background: "#05070d",
    surface: "#0b1020",
    surfaceElevated: "#111827",
    border: "#1f2937",
    text: "#f8fafc",
    textMuted: "#94a3b8",
    accent: {
      primary: "#22d3ee",
      secondary: "#8b5cf6",
      danger: "#fb7185",
      warning: "#f59e0b",
      success: "#34d399",
    },
    status: {
      active: "#34d399",
      sick: "#fb7185",
      vacation: "#f59e0b",
      inactive: "#64748b",
    },
    shift: {
      dayFrom: "#06b6d4",
      dayTo: "#10b981",
      nightFrom: "#6366f1",
      nightTo: "#a855f7",
      holidayFrom: "#f0abfc",
      holidayTo: "#22d3ee",
    },
  },
  radius: {
    card: "1.25rem",
    button: "0.875rem",
  },
  shadow: {
    glow: "0 0 40px rgb(34 211 238 / 0.18)",
  },
} as const;

export type DesignTokens = typeof designTokens;
```

- [ ] **Step 2: Wire Tailwind theme**

```typescript
import type { Config } from "tailwindcss";
import { designTokens } from "./src/lib/design-tokens";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        app: {
          bg: designTokens.color.background,
          surface: designTokens.color.surface,
          elevated: designTokens.color.surfaceElevated,
          border: designTokens.color.border,
          text: designTokens.color.text,
          muted: designTokens.color.textMuted,
        },
        status: designTokens.color.status,
      },
      borderRadius: designTokens.radius,
      boxShadow: designTokens.shadow,
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 3: Verify**

Run: `npm run lint`

Expected: no new lint errors.

---

## Task 2: RBAC Core

**Status:** Implemented. Verification command is blocked until `package.json` and the test runner are added.

**Files:**
- Create: `src/lib/auth/rbac.ts`
- Test: `tests/auth/rbac.test.ts`

- [x] **Step 1: Add RBAC types and matrix**

```typescript
export type Role = "Administrator" | "Planner" | "Accountant";

export type Permission =
  | "users:manage"
  | "objects:manage"
  | "guards:manage"
  | "schedule:read"
  | "schedule:write"
  | "timesheet:read"
  | "timesheet:export"
  | "analytics:read"
  | "system:health";

const rolePermissions = {
  Administrator: [
    "users:manage",
    "objects:manage",
    "guards:manage",
    "schedule:read",
    "schedule:write",
    "timesheet:read",
    "timesheet:export",
    "analytics:read",
    "system:health",
  ],
  Planner: [
    "objects:manage",
    "guards:manage",
    "schedule:read",
    "schedule:write",
  ],
  Accountant: [
    "schedule:read",
    "timesheet:read",
    "timesheet:export",
    "analytics:read",
  ],
} as const satisfies Record<Role, readonly Permission[]>;

export function hasPermission(role: Role, permission: Permission): boolean {
  return rolePermissions[role].includes(permission);
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
```

- [x] **Step 2: Test the matrix**

```typescript
import { describe, expect, it } from "vitest";
import { hasPermission } from "@/lib/auth/rbac";

describe("RBAC", () => {
  it("allows admin to manage users", () => {
    expect(hasPermission("Administrator", "users:manage")).toBe(true);
  });

  it("blocks planner from finance and user management", () => {
    expect(hasPermission("Planner", "users:manage")).toBe(false);
    expect(hasPermission("Planner", "timesheet:read")).toBe(false);
  });

  it("allows accountant to read schedules and export timesheets", () => {
    expect(hasPermission("Accountant", "schedule:read")).toBe(true);
    expect(hasPermission("Accountant", "timesheet:export")).toBe(true);
    expect(hasPermission("Accountant", "schedule:write")).toBe(false);
  });
});
```

- [ ] **Step 3: Verify**

Blocked: `package.json` is missing, so `npm test -- tests/auth/rbac.test.ts` cannot run yet.

Run: `npm test -- tests/auth/rbac.test.ts`

Expected: all RBAC assertions pass.

---

## Task 3: Session And Auth Wrapper

**Status:** Implemented. Verification command is blocked until `package.json` and Next.js dependencies are added.

**Files:**
- Create: `src/lib/auth/session.ts`
- Create: `src/store/current-user-store.ts`
- Create: `src/components/auth/auth-wrapper.tsx`
- Modify: protected route layouts/pages

- [x] **Step 1: Define session contract**

```typescript
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "./rbac";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

export type Session = {
  user: AuthUser;
  expiresAt: Date;
};

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("erp_session")?.value;

  if (!token) return null;

  // Replace with DB-backed lookup by hashed session token.
  return null;
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
```

- [x] **Step 2: Create Zustand store for UX-only role state**

```typescript
"use client";

import { create } from "zustand";
import type { AuthUser } from "@/lib/auth/session";

type CurrentUserState = {
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
};

export const useCurrentUserStore = create<CurrentUserState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));
```

- [x] **Step 3: Create auth wrapper**

```tsx
"use client";

import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { AuthUser } from "@/lib/auth/session";
import type { Permission } from "@/lib/auth/rbac";
import { hasPermission } from "@/lib/auth/rbac";
import { useCurrentUserStore } from "@/store/current-user-store";

type AuthWrapperProps = {
  user: AuthUser | null;
  permission?: Permission;
  children: ReactNode;
  fallback?: ReactNode;
};

export function AuthWrapper({
  user,
  permission,
  children,
  fallback = null,
}: AuthWrapperProps) {
  const router = useRouter();
  const setUser = useCurrentUserStore((state) => state.setUser);

  useEffect(() => {
    setUser(user);
    if (!user) router.replace("/login");
  }, [router, setUser, user]);

  if (!user) return fallback;

  if (permission && !hasPermission(user.role, permission)) {
    return fallback;
  }

  return <>{children}</>;
}
```

- [x] **Step 4: Use server-side enforcement for admin page**

```tsx
import { UserManagementDashboard } from "@/components/admin/user-management-dashboard";
import { assertPermission } from "@/lib/auth/rbac";
import { requireSession } from "@/lib/auth/session";

export default async function AdminUsersPage() {
  const session = await requireSession();
  assertPermission(session.user.role, "users:manage");

  return <UserManagementDashboard currentUser={session.user} />;
}
```

- [ ] **Step 5: Verify**

Blocked: `package.json` is missing, so `npm run lint` cannot run yet.

Run: `npm run lint`

Expected: no hook, import, or server/client boundary errors.

---

## Task 4: Closed Role Login And Optional Managed Admin Seed

**Files:**
- Create: `src/lib/auth/password.ts`
- Create: `src/lib/auth/role-login.ts`
- Create: `src/app/(auth)/login/page.tsx`
- Create: `src/scripts/seed-admin.ts`

- [ ] **Step 1: Password helpers**

```typescript
import argon2 from "argon2";

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}
```

- [ ] **Step 2: Role password login helpers**

Role-login is intentionally closed and does not ask for email. The user selects one of the fixed roles and enters that role's shared environment password.

Required environment variables:

```dotenv
ERP_SESSION_SECRET="replace-with-random-secret"
ADMINISTRATOR_ROLE_PASSWORD="replace"
PLANNER_ROLE_PASSWORD="replace"
ACCOUNTANT_ROLE_PASSWORD="replace"
```

```typescript
import { createHmac, timingSafeEqual } from "node:crypto";
import { roleLabels, type Role } from "@/lib/auth/rbac";
import type { AuthUser } from "@/lib/auth/session";

const rolePasswordEnv: Record<Role, string> = {
  Administrator: "ADMINISTRATOR_ROLE_PASSWORD",
  Planner: "PLANNER_ROLE_PASSWORD",
  Accountant: "ACCOUNTANT_ROLE_PASSWORD",
};

export function authenticateRolePassword(role: Role, password: string): AuthUser | null {
  const expectedPassword = process.env[rolePasswordEnv[role]];

  if (!expectedPassword || !password || !secureCompare(password, expectedPassword)) {
    return null;
  }

  return {
    id: `role:${role}`,
    name: roleLabels[role],
    role,
    sessionVersion: getRoleCredentialVersion(role),
  };
}

export function getRoleCredentialVersion(role: Role): string {
  const password = process.env[rolePasswordEnv[role]];

  if (!password) {
    throw new Error(`${rolePasswordEnv[role]} must be set`);
  }

  return createHmac("sha256", process.env.ERP_SESSION_SECRET!)
    .update(`${role}:${password}`)
    .digest("base64url");
}

function secureCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) return false;

  return timingSafeEqual(leftBuffer, rightBuffer);
}
```

- [ ] **Step 3: Session payload**

Session user is role-based:

```typescript
export type AuthUser = {
  id: `role:${Role}`;
  name: string;
  role: Role;
  sessionVersion: string;
};
```

The signed `erp_session` token must be rejected when:
- signature is invalid;
- token is expired;
- `sessionVersion` does not match the current `getRoleCredentialVersion(role)`.

This invalidates active sessions when a role password changes in `.env`.

- [ ] **Step 4: Optional managed-admin seed**

This seed is for the managed-user records used by the admin dashboard. It is not used by the login page; login stays role/password only.

```typescript
import "dotenv/config";
import { hashPassword } from "@/lib/auth/password";

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required");
  }

  const passwordHash = await hashPassword(password);

  // Create the first managed user with role Administrator and passwordHash.
  // Refuse to create a second Administrator if managed users already exist.
  console.log(`Seeded Administrator: ${email}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 5: Login page requirements**

Implement role/password form:
- shows exactly three role choices: `Administrator`, `Planner`, `Accountant`;
- validates selected role and non-empty password;
- calls a server action or route handler;
- sets `erp_session` as httpOnly cookie;
- sets `secure: true` in production and `sameSite: "lax"`;
- redirects to `/dashboard`;
- invalid credentials redirect back to `/login?error=invalid`;
- never exposes registration CTA.

- [ ] **Step 6: Verify**

Run: `npm run lint && npm run test`

Expected: role login works without email, no auth regressions.

---

## Task 5: Admin User Management Dashboard

**Files:**
- Create: `src/components/admin/user-management-dashboard.tsx`
- Create: `src/app/api/admin/users/route.ts`

- [ ] **Step 1: Component skeleton**

```tsx
"use client";

import { Shield, UserPlus, Activity } from "lucide-react";
import { motion } from "framer-motion";
import type { AuthUser } from "@/lib/auth/session";
import type { Role } from "@/lib/auth/rbac";

type ManagedUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  lastLoginAt: string | null;
};

type UserManagementDashboardProps = {
  currentUser: AuthUser;
  initialUsers?: ManagedUser[];
};

const roleLabels: Record<Role, string> = {
  Administrator: "Администратор",
  Planner: "Планировщик",
  Accountant: "Бухгалтер",
};

export function UserManagementDashboard({
  currentUser,
  initialUsers = [],
}: UserManagementDashboardProps) {
  return (
    <main className="min-h-screen bg-app-bg p-6 text-app-text">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-card border border-app-border bg-app-surface p-6 shadow-glow"
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-cyan-300">
              <Shield className="size-5" />
              <span className="text-sm uppercase tracking-[0.24em]">Admin Console</span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold">Управление пользователями</h1>
            <p className="mt-2 text-sm text-app-muted">
              Текущий доступ: {currentUser.name}
            </p>
          </div>

          <button className="inline-flex items-center gap-2 rounded-button bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950">
            <UserPlus className="size-4" />
            Создать пользователя
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <HealthCard label="Активные сессии" value="0" />
          <HealthCard label="Пользователи" value={String(initialUsers.length)} />
          <HealthCard label="Ошибки доступа" value="0" tone="rose" />
        </div>

        <div className="mt-6 overflow-hidden rounded-card border border-app-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-app-elevated text-app-muted">
              <tr>
                <th className="px-4 py-3">Имя</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Роль</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3">Последний вход</th>
              </tr>
            </thead>
            <tbody>
              {initialUsers.map((user) => (
                <tr key={user.id} className="border-t border-app-border">
                  <td className="px-4 py-3">{user.name}</td>
                  <td className="px-4 py-3 text-app-muted">{user.email}</td>
                  <td className="px-4 py-3">{roleLabels[user.role]}</td>
                  <td className="px-4 py-3">
                    <span className={user.active ? "text-status-active" : "text-status-inactive"}>
                      {user.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-app-muted">{user.lastLoginAt ?? "never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.section>
    </main>
  );
}

function HealthCard({
  label,
  value,
  tone = "cyan",
}: {
  label: string;
  value: string;
  tone?: "cyan" | "rose";
}) {
  return (
    <div className="rounded-card border border-app-border bg-app-elevated p-4">
      <div className={`flex items-center gap-2 ${tone === "rose" ? "text-rose-300" : "text-cyan-300"}`}>
        <Activity className="size-4" />
        <span className="text-xs uppercase tracking-[0.2em]">{label}</span>
      </div>
      <div className="mt-3 text-2xl font-semibold">{value}</div>
    </div>
  );
}
```

- [ ] **Step 2: API route must enforce admin**

```typescript
import { NextResponse } from "next/server";
import { assertPermission } from "@/lib/auth/rbac";
import { requireSession } from "@/lib/auth/session";

export async function POST(request: Request) {
  const session = await requireSession();
  assertPermission(session.user.role, "users:manage");

  const body = await request.json();

  // Validate body with zod, hash password, create user, return safe user DTO.
  return NextResponse.json({ ok: true, user: body }, { status: 201 });
}
```

- [ ] **Step 3: Verify**

Run: `npm run lint`

Expected: component imports are valid and no server-only code is imported into client components.

---

## Task 6: Scheduling Types And Conflict Prevention

**Files:**
- Create: `src/lib/scheduling/types.ts`
- Create: `src/lib/scheduling/conflicts.ts`
- Test: `tests/scheduling/conflicts.test.ts`

- [ ] **Step 1: Add scheduling types**

```typescript
export type GuardStatus = "Active" | "Sick" | "OnVacation" | "Inactive";

export type Guard = {
  id: string;
  name: string;
  status: GuardStatus;
};

export type Shift = {
  id: string;
  guardId: string;
  objectId: string;
  startsAt: Date;
  endsAt: Date;
};
```

- [ ] **Step 2: Add hard blockers**

```typescript
import type { Guard, Shift } from "./types";

export type ScheduleConflict =
  | { type: "guard-status"; status: Guard["status"] }
  | { type: "shift-overlap"; shiftId: string; objectId: string };

export function findScheduleConflict(
  guard: Guard,
  candidate: Omit<Shift, "id">,
  existingShifts: Shift[],
): ScheduleConflict | null {
  if (guard.status === "Sick" || guard.status === "OnVacation") {
    return { type: "guard-status", status: guard.status };
  }

  const overlap = existingShifts.find((shift) => {
    if (shift.guardId !== guard.id) return false;
    return candidate.startsAt < shift.endsAt && candidate.endsAt > shift.startsAt;
  });

  if (overlap) {
    return {
      type: "shift-overlap",
      shiftId: overlap.id,
      objectId: overlap.objectId,
    };
  }

  return null;
}
```

- [ ] **Step 3: Test conflicts**

```typescript
import { describe, expect, it } from "vitest";
import { findScheduleConflict } from "@/lib/scheduling/conflicts";

describe("schedule conflicts", () => {
  it("blocks sick guards", () => {
    const conflict = findScheduleConflict(
      { id: "g1", name: "Ivan", status: "Sick" },
      {
        guardId: "g1",
        objectId: "o1",
        startsAt: new Date("2026-05-01T08:00:00+10:00"),
        endsAt: new Date("2026-05-01T20:00:00+10:00"),
      },
      [],
    );

    expect(conflict).toEqual({ type: "guard-status", status: "Sick" });
  });

  it("blocks overlapping shifts for the same guard", () => {
    const conflict = findScheduleConflict(
      { id: "g1", name: "Ivan", status: "Active" },
      {
        guardId: "g1",
        objectId: "o2",
        startsAt: new Date("2026-05-01T12:00:00+10:00"),
        endsAt: new Date("2026-05-01T18:00:00+10:00"),
      },
      [
        {
          id: "s1",
          guardId: "g1",
          objectId: "o1",
          startsAt: new Date("2026-05-01T08:00:00+10:00"),
          endsAt: new Date("2026-05-01T20:00:00+10:00"),
        },
      ],
    );

    expect(conflict).toEqual({ type: "shift-overlap", shiftId: "s1", objectId: "o1" });
  });
});
```

---

## Task 7: Automated Hour Calculator

**Files:**
- Create: `src/lib/scheduling/hour-calculator.ts`
- Test: `tests/scheduling/hour-calculator.test.ts`

- [ ] **Step 1: Implement calculator**

```typescript
export type HourBreakdown = {
  totalMinutes: number;
  nightMinutes: number;
  holidayMinutes: number;
  totalHours: number;
  nightHours: number;
  holidayHours: number;
};

type CalculateHoursInput = {
  startsAt: Date;
  endsAt: Date;
  holidayDates?: ReadonlySet<string>;
};

export function calculateShiftHours({
  startsAt,
  endsAt,
  holidayDates = new Set<string>(),
}: CalculateHoursInput): HourBreakdown {
  if (endsAt <= startsAt) {
    throw new Error("Shift end must be after shift start");
  }

  let totalMinutes = 0;
  let nightMinutes = 0;
  let holidayMinutes = 0;

  for (let cursor = new Date(startsAt); cursor < endsAt; cursor = addMinutes(cursor, 1)) {
    totalMinutes += 1;

    if (isNightMinute(cursor)) {
      nightMinutes += 1;
    }

    if (holidayDates.has(toLocalDateKey(cursor))) {
      holidayMinutes += 1;
    }
  }

  return {
    totalMinutes,
    nightMinutes,
    holidayMinutes,
    totalHours: roundHours(totalMinutes),
    nightHours: roundHours(nightMinutes),
    holidayHours: roundHours(holidayMinutes),
  };
}

function isNightMinute(date: Date): boolean {
  const hour = date.getHours();
  return hour < 8 || hour >= 20;
}

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function roundHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}
```

- [ ] **Step 2: Test day, night, cross-midnight, and holiday**

```typescript
import { describe, expect, it } from "vitest";
import { calculateShiftHours } from "@/lib/scheduling/hour-calculator";

describe("calculateShiftHours", () => {
  it("calculates a day shift", () => {
    expect(
      calculateShiftHours({
        startsAt: new Date("2026-05-01T08:00:00+10:00"),
        endsAt: new Date("2026-05-01T20:00:00+10:00"),
      }),
    ).toMatchObject({
      totalHours: 12,
      nightHours: 0,
      holidayHours: 0,
    });
  });

  it("calculates a night shift crossing midnight", () => {
    expect(
      calculateShiftHours({
        startsAt: new Date("2026-05-01T20:00:00+10:00"),
        endsAt: new Date("2026-05-02T08:00:00+10:00"),
      }),
    ).toMatchObject({
      totalHours: 12,
      nightHours: 12,
      holidayHours: 0,
    });
  });

  it("counts partial night minutes", () => {
    expect(
      calculateShiftHours({
        startsAt: new Date("2026-05-01T18:00:00+10:00"),
        endsAt: new Date("2026-05-01T22:30:00+10:00"),
      }),
    ).toMatchObject({
      totalMinutes: 270,
      nightMinutes: 150,
      totalHours: 4.5,
      nightHours: 2.5,
    });
  });

  it("counts holiday minutes independently", () => {
    expect(
      calculateShiftHours({
        startsAt: new Date("2026-05-01T20:00:00+10:00"),
        endsAt: new Date("2026-05-02T08:00:00+10:00"),
        holidayDates: new Set(["2026-05-02"]),
      }),
    ).toMatchObject({
      totalHours: 12,
      nightHours: 12,
      holidayHours: 8,
    });
  });
});
```

- [ ] **Step 3: Verify**

Run: `npm test -- tests/scheduling/hour-calculator.test.ts`

Expected: all accounting edge cases pass.

---

## Task 8: Object, Guard, Scheduler, And Logs

**Files:**
- Create: object manager pages/components
- Create: guard manager pages/components
- Create: scheduler grid components
- Create: shift log API and UI

- [ ] **Step 1: Object selected view**

Implement selected object panel with:
- object info card;
- assigned staff list;
- `Add Guard` action gated by `guards:manage`;
- status chips from design tokens.

- [ ] **Step 2: Guard filters**

Implement filters:
- availability for selected date range;
- history by object/date;
- status: `Active`, `Sick`, `OnVacation`, `Inactive`.

- [ ] **Step 3: Smart scheduler grid**

Implement timeline:
- day shift gradient `cyan -> emerald`;
- night shift gradient `indigo -> violet`;
- holiday overlay `fuchsia/cyan`;
- conflict messages from `findScheduleConflict`.

- [ ] **Step 4: Guard logs**

Create logs attached to a shift:
- fields: `shiftId`, `authorUserId`, `createdAt`, `note`, `incidentLevel`;
- `Planner` and `Administrator` can write;
- `Accountant` can read if needed for timesheet context, but cannot edit.

---

## Task 9: Accounting And Analytics

**Files:**
- Create: `src/app/accounting/timesheet/page.tsx`
- Create: `src/components/accounting/timesheet-view.tsx`
- Create: export route/action

- [ ] **Step 1: Server permissions**

Every accounting route starts with:

```typescript
const session = await requireSession();
assertPermission(session.user.role, "timesheet:read");
```

- [ ] **Step 2: Timesheet view**

Use `calculateShiftHours` for each shift and aggregate:
- weekly totals;
- monthly totals;
- total hours;
- night hours;
- holiday hours;
- guard history: where, when, how long.

- [ ] **Step 3: Export**

Export CSV/XLSX with columns:
- guard name;
- object;
- shift start;
- shift end;
- total hours;
- night hours;
- holiday hours;
- incidents count.

Gate export with `timesheet:export`.

---

## Task 10: Verification Checklist

- [ ] `Administrator` can create/edit/disable users and roles.
- [ ] `Planner` cannot open `/admin/users` and cannot call user API routes.
- [ ] `Planner` can manage objects, guards, schedule, and shift logs.
- [ ] `Accountant` can open schedules read-only and accounting pages.
- [ ] `Accountant` cannot mutate schedule.
- [ ] Sick/vacation guards cannot be assigned.
- [ ] Overlapping guard shifts are blocked server-side.
- [ ] Day shift `08:00-20:00` returns 12 total, 0 night.
- [ ] Night shift `20:00-08:00` returns 12 total, 12 night.
- [ ] Holiday minutes are counted by local date.
- [ ] There is no public registration page, link, server action, or route.

Run before merge:

```bash
npm run lint
npm run test
npm run build
```

