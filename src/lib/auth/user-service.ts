import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { hashPassword, verifyPassword } from "./password";
import { roleLabels, roles, type Role } from "./rbac";

import type { AuthUser } from "./session";

export type ManagedUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  sessionVersion: number;
  lastLoginAt: string | null;
};

type StoredUser = ManagedUser & {
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
};

type CreateManagedUserInput = {
  email: string;
  name: string;
  role: Role;
  password: string;
  active?: boolean;
};

export type UpdateManagedUserInput = {
  userId: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
};

type SeedAdministratorInput = {
  email: string;
  password: string;
  name?: string;
};

export class DuplicateUserError extends Error {
  constructor(email: string) {
    super(`User with email ${email} already exists`);
    this.name = "DuplicateUserError";
  }
}

export class InvalidUserInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidUserInputError";
  }
}

export async function upsertSeedAdministrator(input: SeedAdministratorInput): Promise<ManagedUser> {
  const email = normalizeEmail(input.email);
  const password = normalizePassword(input.password);
  const users = await readStoredUsers();
  const now = new Date().toISOString();
  const existingIndex = users.findIndex((user) => user.email === email);
  const existing = existingIndex >= 0 ? users[existingIndex] : null;

  if (users.length > 0 && (!existing || existing.role !== "Administrator")) {
    throw new InvalidUserInputError(
      "Seed admin can only initialize the first user or rotate the existing Administrator credentials",
    );
  }

  const seededUser: StoredUser = {
    id: existing?.id ?? randomUUID(),
    email,
    name: normalizeName(input.name ?? existing?.name ?? roleLabels.Administrator),
    role: "Administrator",
    active: true,
    sessionVersion: (existing?.sessionVersion ?? 0) + 1,
    lastLoginAt: existing?.lastLoginAt ?? null,
    passwordHash: await hashPassword(password),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  if (existingIndex >= 0) {
    users[existingIndex] = seededUser;
  } else {
    users.push(seededUser);
  }

  await writeStoredUsers(users);
  return toManagedUser(seededUser);
}

export async function createManagedUser(input: CreateManagedUserInput): Promise<ManagedUser> {
  const email = normalizeEmail(input.email);
  const password = normalizePassword(input.password);
  const users = await readStoredUsers();

  if (users.some((user) => user.email === email)) {
    throw new DuplicateUserError(email);
  }

  const now = new Date().toISOString();
  const user: StoredUser = {
    id: randomUUID(),
    email,
    name: normalizeName(input.name),
    role: normalizeRole(input.role),
    active: input.active ?? true,
    sessionVersion: 1,
    lastLoginAt: null,
    passwordHash: await hashPassword(password),
    createdAt: now,
    updatedAt: now,
  };

  users.push(user);
  await writeStoredUsers(users);
  return toManagedUser(user);
}

export async function authenticateUser(
  emailInput: string,
  passwordInput: string,
): Promise<ManagedUser | null> {
  const email = normalizeEmail(emailInput);
  const users = await readStoredUsers();
  const userIndex = users.findIndex((storedUser) => storedUser.email === email);
  const user = userIndex >= 0 ? users[userIndex] : null;

  if (!user || !user.active) return null;
  if (!(await verifyPassword(user.passwordHash, passwordInput))) return null;

  const updatedUser: StoredUser = {
    ...user,
    lastLoginAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  users[userIndex] = updatedUser;
  await writeStoredUsers(users);

  return toManagedUser(updatedUser);
}

/** Вход по выбранной учётной записи (id + пароль) — для страницы логина. */
export async function authenticateUserById(
  userId: string,
  passwordInput: string,
): Promise<ManagedUser | null> {
  if (!userId || typeof passwordInput !== "string") return null;
  const users = await readStoredUsers();
  const userIndex = users.findIndex((storedUser) => storedUser.id === userId);
  const user = userIndex >= 0 ? users[userIndex] : null;

  if (!user || !user.active) return null;
  if (!(await verifyPassword(user.passwordHash, passwordInput))) return null;

  const updatedUser: StoredUser = {
    ...user,
    lastLoginAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  users[userIndex] = updatedUser;
  await writeStoredUsers(users);

  return toManagedUser(updatedUser);
}

export async function updateManagedUser(input: UpdateManagedUserInput): Promise<ManagedUser> {
  const email = normalizeEmail(input.email);
  const name = normalizeName(input.name);
  const role = normalizeRole(input.role);
  const users = await readStoredUsers();
  const userIndex = users.findIndex((storedUser) => storedUser.id === input.userId);
  if (userIndex < 0) throw new InvalidUserInputError("Пользователь не найден");

  const prev = users[userIndex]!;

  if (users.some((storedUser) => storedUser.id !== input.userId && storedUser.email === email)) {
    throw new DuplicateUserError(email);
  }

  assertAtLeastOneActiveAdministrator(users, prev, { role, active: input.active });

  const roleChanged = prev.role !== role;
  const emailChanged = prev.email !== email;
  const deactivated = prev.active && !input.active;
  const sessionVersion =
    roleChanged || emailChanged || deactivated ? prev.sessionVersion + 1 : prev.sessionVersion;

  const updated: StoredUser = {
    ...prev,
    email,
    name,
    role,
    active: input.active,
    sessionVersion,
    updatedAt: new Date().toISOString(),
  };
  users[userIndex] = updated;
  await writeStoredUsers(users);
  return toManagedUser(updated);
}

export async function deleteManagedUser(userId: string): Promise<void> {
  const users = await readStoredUsers();
  const userIndex = users.findIndex((storedUser) => storedUser.id === userId);
  if (userIndex < 0) throw new InvalidUserInputError("Пользователь не найден");

  const target = users[userIndex]!;
  const activeAdmins = users.filter((user) => user.role === "Administrator" && user.active);
  if (target.role === "Administrator" && target.active) {
    const otherActiveAdmins = activeAdmins.filter((user) => user.id !== target.id);
    if (otherActiveAdmins.length === 0) {
      throw new InvalidUserInputError("Нельзя удалить единственного администратора");
    }
  }

  users.splice(userIndex, 1);
  await writeStoredUsers(users);
}

export async function updateManagedUserPassword(userId: string, newPassword: string): Promise<ManagedUser> {
  const password = normalizePassword(newPassword);
  const users = await readStoredUsers();
  const userIndex = users.findIndex((storedUser) => storedUser.id === userId);
  if (userIndex < 0) throw new InvalidUserInputError("Пользователь не найден");

  const prev = users[userIndex]!;
  const updated: StoredUser = {
    ...prev,
    passwordHash: await hashPassword(password),
    sessionVersion: prev.sessionVersion + 1,
    updatedAt: new Date().toISOString(),
  };
  users[userIndex] = updated;
  await writeStoredUsers(users);
  return toManagedUser(updated);
}

export async function listActiveManagedUsersForLogin(): Promise<ManagedUser[]> {
  const users = await listManagedUsers();
  return users
    .filter((user) => user.active)
    .sort((a, b) => a.name.localeCompare(b.name, "ru-RU"));
}

export function managedUserToAuthUser(user: ManagedUser): AuthUser {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    sessionVersion: String(user.sessionVersion),
  };
}

export async function getManagedUserById(id: string): Promise<ManagedUser | null> {
  const users = await readStoredUsers();
  const user = users.find((storedUser) => storedUser.id === id);
  return user ? toManagedUser(user) : null;
}

export async function listManagedUsers(): Promise<ManagedUser[]> {
  const users = await readStoredUsers();
  return users.map(toManagedUser);
}

function getUsersFilePath(): string {
  return process.env.ERP_USERS_FILE ?? join(process.cwd(), "data", "users.json");
}

let storedUsersCache: { mtimeMs: number; users: StoredUser[] } | null = null;

async function readStoredUsers(): Promise<StoredUser[]> {
  const filePath = getUsersFilePath();
  try {
    const fileStat = await stat(filePath);
    if (storedUsersCache && storedUsersCache.mtimeMs === fileStat.mtimeMs) {
      return storedUsersCache.users;
    }
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const users = Array.isArray(parsed) ? parsed.map(parseStoredUser) : [];
    storedUsersCache = { mtimeMs: fileStat.mtimeMs, users };
    return users;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeStoredUsers(users: StoredUser[]): Promise<void> {
  const filePath = getUsersFilePath();
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(users, null, 2)}\n`, "utf8");
  await rename(tempPath, filePath);
  storedUsersCache = null;
}

function parseStoredUser(value: unknown): StoredUser {
  if (!value || typeof value !== "object") {
    throw new InvalidUserInputError("Stored user must be an object");
  }

  const user = value as Partial<StoredUser>;
  if (
    typeof user.id !== "string" ||
    typeof user.email !== "string" ||
    typeof user.name !== "string" ||
    !isRole(user.role) ||
    typeof user.active !== "boolean" ||
    typeof user.sessionVersion !== "number" ||
    typeof user.passwordHash !== "string" ||
    typeof user.createdAt !== "string" ||
    typeof user.updatedAt !== "string" ||
    (user.lastLoginAt !== null && typeof user.lastLoginAt !== "string")
  ) {
    throw new InvalidUserInputError("Stored user has invalid shape");
  }

  return user as StoredUser;
}

function toManagedUser(user: StoredUser): ManagedUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    active: user.active,
    sessionVersion: user.sessionVersion,
    lastLoginAt: user.lastLoginAt,
  };
}

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!normalized) throw new InvalidUserInputError("Email is required");
  return normalized;
}

function normalizeName(name: string): string {
  const normalized = name.trim();
  if (!normalized) throw new InvalidUserInputError("Name is required");
  return normalized;
}

function normalizePassword(password: string): string {
  if (!password) throw new InvalidUserInputError("Password is required");
  return password;
}

function normalizeRole(role: Role): Role {
  if (!isRole(role)) throw new InvalidUserInputError("Role is invalid");
  return role;
}

function isRole(value: unknown): value is Role {
  return roles.includes(value as Role);
}

function assertAtLeastOneActiveAdministrator(
  users: StoredUser[],
  target: StoredUser,
  next: { role: Role; active: boolean },
): void {
  const activeAdmins = users.filter((user) => user.role === "Administrator" && user.active);
  if (activeAdmins.length === 0) return;

  const targetWasActiveAdmin = target.role === "Administrator" && target.active;
  if (!targetWasActiveAdmin) return;

  const stillActiveAdmin = next.role === "Administrator" && next.active;
  if (stillActiveAdmin) return;

  const otherActiveAdmins = activeAdmins.filter((user) => user.id !== target.id);
  if (otherActiveAdmins.length === 0) {
    throw new InvalidUserInputError("Нельзя отключить или понизить единственного администратора");
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
