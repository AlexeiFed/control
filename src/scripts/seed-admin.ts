import "dotenv/config";
import { upsertSeedAdministrator } from "../lib/auth/user-service";

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME;

  if (!email || !password) {
    throw new Error("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required");
  }

  const user = await upsertSeedAdministrator({ email, password, name });
  console.log(`Seeded Administrator: ${user.email}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
