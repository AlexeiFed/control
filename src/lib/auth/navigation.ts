import type { AuthUser } from "./session";

export function getLandingPath(user: AuthUser | null): "/dashboard" | "/login" {
  return user ? "/dashboard" : "/login";
}
