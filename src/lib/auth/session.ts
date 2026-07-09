import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { type Role } from "./rbac";
import { getRoleCredentialVersion, isRole, getSessionSecret } from "./role-login";
import { getManagedUserById } from "./user-service";

export type AuthUser = {
  id: string;
  name: string;
  role: Role;
  sessionVersion: string;
};

export type Session = {
  user: AuthUser;
  expiresAt: Date;
};

type SessionPayload = {
  user: AuthUser;
  expiresAt: number;
};

export const sessionCookieName = "erp_session";

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;

  if (!token) return null;

  return readSessionToken(token);
}

export async function readSessionToken(token: string): Promise<Session | null> {
  const payload = verifySessionToken(token);

  if (!payload || payload.expiresAt <= Date.now()) {
    return null;
  }

  if (payload.user.id.startsWith("role:")) {
    if (payload.user.id !== `role:${payload.user.role}`) {
      return null;
    }
    try {
      if (getRoleCredentialVersion(payload.user.role) !== payload.user.sessionVersion) {
        return null;
      }
    } catch {
      return null;
    }
  } else {
    const managed = await getManagedUserById(payload.user.id);
    if (!managed || !managed.active) {
      return null;
    }
    if (String(managed.sessionVersion) !== payload.user.sessionVersion) {
      return null;
    }
  }

  return {
    user: payload.user,
    expiresAt: new Date(payload.expiresAt),
  };
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export function signSessionToken(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", getSessionSecret()).update(body).digest("base64url");

  return `${body}.${signature}`;
}

function verifySessionToken(token: string): SessionPayload | null {
  const [body, signature] = token.split(".");

  if (!body || !signature) return null;

  const expectedSignature = createHmac("sha256", getSessionSecret())
    .update(body)
    .digest("base64url");

  if (!secureCompare(signature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (!isAuthUser(payload.user) || typeof payload.expiresAt !== "number") return null;

    return payload;
  } catch {
    return null;
  }
}

function secureCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) return false;

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function isAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== "object") return false;
  const user = value as Partial<AuthUser>;

  return (
    typeof user.id === "string" &&
    typeof user.name === "string" &&
    isRole(user.role) &&
    typeof user.sessionVersion === "string"
  );
}


