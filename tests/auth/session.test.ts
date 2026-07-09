import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readSessionToken, signSessionToken } from "../../src/lib/auth/session";
import { createRoleUser } from "../../src/lib/auth/role-login";
import {
  listManagedUsers,
  managedUserToAuthUser,
  updateManagedUserPassword,
  upsertSeedAdministrator,
} from "../../src/lib/auth/user-service";

let usersTempDir: string | undefined;

beforeEach(async () => {
  process.env.ERP_SESSION_SECRET = "test-secret-with-enough-entropy";
  process.env.ADMINISTRATOR_ROLE_PASSWORD = "admin-secret";
});

afterEach(async () => {
  delete process.env.ERP_SESSION_SECRET;
  delete process.env.ADMINISTRATOR_ROLE_PASSWORD;
  delete process.env.ERP_USERS_FILE;
  if (usersTempDir) {
    await rm(usersTempDir, { recursive: true, force: true });
    usersTempDir = undefined;
  }
});

describe("sessions", () => {
  it("rejects tokens after role password rotates", async () => {
    const admin = createRoleUser("Administrator");
    const token = signSessionToken({
      user: admin,
      expiresAt: Date.now() + 60_000,
    });

    await expect(readSessionToken(token)).resolves.toMatchObject({
      user: { id: "role:Administrator", role: "Administrator" },
    });

    process.env.ADMINISTRATOR_ROLE_PASSWORD = "new-admin-secret";

    await expect(readSessionToken(token)).resolves.toBeNull();
  });

  it("accepts managed user tokens and rejects after password change", async () => {
    usersTempDir = await mkdtemp(join(tmpdir(), "control-session-users-"));
    process.env.ERP_USERS_FILE = join(usersTempDir, "users.json");

    await upsertSeedAdministrator({
      email: "admin@erp.local",
      password: "admin-secret",
    });

    const managed = (await listManagedUsers())[0]!;
    const user = managedUserToAuthUser(managed);
    const token = signSessionToken({
      user,
      expiresAt: Date.now() + 60_000,
    });

    await expect(readSessionToken(token)).resolves.toMatchObject({
      user: { id: managed.id, role: "Administrator" },
    });

    await updateManagedUserPassword(managed.id, "rotated-pass-9");

    await expect(readSessionToken(token)).resolves.toBeNull();
  });
});
