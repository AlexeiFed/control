"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { AuthUser } from "../../lib/auth/session";
import { hasPermission, type Permission } from "../../lib/auth/rbac";
import { useCurrentUserStore } from "../../store/current-user-store";

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
