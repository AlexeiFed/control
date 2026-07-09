import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  authenticateUser,
  authenticateUserById,
  createManagedUser,
  deleteManagedUser,
  InvalidUserInputError,
  listManagedUsers,
  updateManagedUser,
  updateManagedUserPassword,
  upsertSeedAdministrator,
} from "../../src/lib/auth/user-service";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "control-users-"));
  process.env.ERP_USERS_FILE = join(tempDir, "users.json");
});

afterEach(async () => {
  delete process.env.ERP_USERS_FILE;
  await rm(tempDir, { recursive: true, force: true });
});

describe("user service", () => {
  it("seeds an Administrator with a hashed password and authenticates by email", async () => {
    const admin = await upsertSeedAdministrator({
      email: "Admin@ERP.Local",
      password: "admin-secret",
    });

    expect(admin).toMatchObject({
      email: "admin@erp.local",
      name: "Администратор",
      role: "Administrator",
      active: true,
      sessionVersion: 1,
    });
    expect("passwordHash" in admin).toBe(false);

    const rawUsers = await readFile(process.env.ERP_USERS_FILE!, "utf8");
    expect(rawUsers).toContain("$argon2id$");
    expect(rawUsers).not.toContain("admin-secret");

    await expect(authenticateUser("admin@erp.local", "admin-secret")).resolves.toMatchObject({
      email: "admin@erp.local",
      role: "Administrator",
    });
    await expect(authenticateUser("admin@erp.local", "wrong")).resolves.toBeNull();
  });

  it("lets an Administrator create non-admin users and list safe user DTOs", async () => {
    await upsertSeedAdministrator({
      email: "admin@erp.local",
      password: "admin-secret",
    });

    const planner = await createManagedUser({
      email: "Planner@ERP.Local",
      name: "Планировщик смен",
      role: "Planner",
      password: "planner-secret",
      active: true,
    });

    expect(planner).toMatchObject({
      email: "planner@erp.local",
      role: "Planner",
      active: true,
      lastLoginAt: null,
    });
    expect("passwordHash" in planner).toBe(false);

    const users = await listManagedUsers();
    expect(users).toHaveLength(2);
    expect(users.some((user) => "passwordHash" in user)).toBe(false);
  });

  it("does not seed a second Administrator after users exist", async () => {
    const admin = await upsertSeedAdministrator({
      email: "admin@erp.local",
      password: "admin-secret",
    });

    await expect(
      upsertSeedAdministrator({
        email: "second-admin@erp.local",
        password: "second-secret",
      }),
    ).rejects.toBeInstanceOf(InvalidUserInputError);

    const rotatedAdmin = await upsertSeedAdministrator({
      email: "admin@erp.local",
      password: "new-admin-secret",
    });

    expect(rotatedAdmin.id).toBe(admin.id);
    expect(rotatedAdmin.sessionVersion).toBe(admin.sessionVersion + 1);
    await expect(authenticateUser("admin@erp.local", "admin-secret")).resolves.toBeNull();
    await expect(authenticateUser("admin@erp.local", "new-admin-secret")).resolves.toMatchObject({
      email: "admin@erp.local",
      role: "Administrator",
    });
  });

  it("authenticates by user id for login form", async () => {
    await upsertSeedAdministrator({
      email: "admin@erp.local",
      password: "admin-secret",
    });

    const admin = (await listManagedUsers())[0]!;
    await expect(authenticateUserById(admin.id, "admin-secret")).resolves.toMatchObject({
      id: admin.id,
      email: "admin@erp.local",
    });
    await expect(authenticateUserById(admin.id, "wrong")).resolves.toBeNull();
    await expect(authenticateUserById("00000000-0000-4000-8000-000000000000", "x")).resolves.toBeNull();
  });

  it("updates user profile and bumps session on role change", async () => {
    await upsertSeedAdministrator({
      email: "admin@erp.local",
      password: "admin-secret",
    });

    const planner = await createManagedUser({
      email: "planner@erp.local",
      name: "Планировщик",
      role: "Planner",
      password: "planner-secret",
    });
    const v1 = planner.sessionVersion;

    const updated = await updateManagedUser({
      userId: planner.id,
      email: "planner2@erp.local",
      name: "Планировщик 2",
      role: "Accountant",
      active: true,
    });

    expect(updated).toMatchObject({
      email: "planner2@erp.local",
      name: "Планировщик 2",
      role: "Accountant",
      active: true,
      sessionVersion: v1 + 1,
    });
  });

  it("blocks demoting the only active administrator", async () => {
    await upsertSeedAdministrator({
      email: "admin@erp.local",
      password: "admin-secret",
    });
    const admin = (await listManagedUsers())[0]!;

    await expect(
      updateManagedUser({
        userId: admin.id,
        email: admin.email,
        name: admin.name,
        role: "Planner",
        active: true,
      }),
    ).rejects.toBeInstanceOf(InvalidUserInputError);
  });

  it("deletes user and blocks deleting the only administrator", async () => {
    await upsertSeedAdministrator({
      email: "admin@erp.local",
      password: "admin-secret",
    });

    const planner = await createManagedUser({
      email: "planner@erp.local",
      name: "Планировщик",
      role: "Planner",
      password: "planner-secret",
    });

    await deleteManagedUser(planner.id);
    expect(await listManagedUsers()).toHaveLength(1);

    const admin = (await listManagedUsers())[0]!;
    await expect(deleteManagedUser(admin.id)).rejects.toBeInstanceOf(InvalidUserInputError);
  });

  it("updates password and bumps session version", async () => {
    await upsertSeedAdministrator({
      email: "admin@erp.local",
      password: "admin-secret",
    });
    const admin = (await listManagedUsers())[0]!;
    const v1 = admin.sessionVersion;

    const updated = await updateManagedUserPassword(admin.id, "new-password-9");
    expect(updated.sessionVersion).toBe(v1 + 1);
    await expect(authenticateUser("admin@erp.local", "admin-secret")).resolves.toBeNull();
    await expect(authenticateUser("admin@erp.local", "new-password-9")).resolves.toMatchObject({
      email: "admin@erp.local",
    });
  });
});
