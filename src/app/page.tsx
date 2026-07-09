import { redirect } from "next/navigation";
import { getLandingPath } from "../lib/auth/navigation";
import { getSession } from "../lib/auth/session";

export default async function HomePage() {
  const session = await getSession();
  redirect(getLandingPath(session?.user ?? null));
}
