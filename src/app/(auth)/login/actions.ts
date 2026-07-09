"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessionCookieName, signSessionToken } from "../../../lib/auth/session";
import {
  authenticateUserById,
  managedUserToAuthUser,
} from "../../../lib/auth/user-service";

const sessionMaxAgeSeconds = 60 * 60 * 24 * 30; // 30 дней

export async function loginByUser(formData: FormData): Promise<never> {
  const userId = formData.get("userId");
  const password = formData.get("password");

  if (typeof userId !== "string" || !userId || typeof password !== "string" || !password) {
    redirect("/login?error=invalid");
  }

  const managed = await authenticateUserById(userId, password);

  if (!managed) {
    redirect("/login?error=invalid");
  }

  const user = managedUserToAuthUser(managed);
  const expiresAt = Date.now() + sessionMaxAgeSeconds * 1000;
  const token = signSessionToken({ user, expiresAt });
  const cookieStore = await cookies();

  cookieStore.set(sessionCookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: sessionMaxAgeSeconds,
  });

  redirect("/dashboard");
}
