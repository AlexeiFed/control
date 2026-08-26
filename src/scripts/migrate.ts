import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";

const MIGRATIONS_DIR = join(process.cwd(), "src", "db", "migrations");

async function ensureMigrationsTable(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function loadApplied(pool: Pool): Promise<Set<string>> {
  const { rows } = await pool.query<{ name: string }>(`SELECT name FROM schema_migrations`);
  return new Set(rows.map((r) => r.name));
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required (см. .env)");
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    await ensureMigrationsTable(pool);
    const applied = await loadApplied(pool);

    let files: string[];
    try {
      files = (await readdir(MIGRATIONS_DIR))
        .filter((f) => f.endsWith(".sql") && !f.startsWith("."))
        .sort();
    } catch (e) {
      throw new Error(`Не найден каталог миграций: ${MIGRATIONS_DIR}`, { cause: e });
    }

    if (files.length === 0) {
      console.log("Нет .sql файлов в migrations.");
      return;
    }

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`[skip] ${file}`);
        continue;
      }

      const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [file]);
        await client.query("COMMIT");
        console.log(`[ok] ${file}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }

    if (process.env.MIGRATE_SKIP_POST_SYNC === "1") {
      console.log("[post-sync] пропущен (MIGRATE_SKIP_POST_SYNC=1)");
      return;
    }

    console.log("[post-sync] timesheet backfill…");
    const { backfillMissingTimesheetEntriesSafe, resyncOutdatedTimesheetEntriesSafe } = await import(
      "../lib/accounting/sync-timesheet-entry"
    );
    const backfilled = await backfillMissingTimesheetEntriesSafe();
    console.log(`[timesheet-backfill] дозаполнено смен: ${backfilled}`);

    console.log("[post-sync] timesheet resync…");
    const resynced = await resyncOutdatedTimesheetEntriesSafe();
    console.log(`[timesheet-resync] пересчитано смен: ${resynced}`);

    console.log("[post-sync] curator sync…");
    const { resyncCuratorTopUpExclusionShiftsSafe } = await import("../lib/curators/sync-shift-entry");
    const curatorResynced = await resyncCuratorTopUpExclusionShiftsSafe();
    console.log(`[curator-sync] пересчитано смен с исключением доплаты: ${curatorResynced}`);

    console.log("[post-sync] profile-periods…");
    const { backfillAllGuardProfilePeriodsFromCompliance } = await import(
      "../lib/operations/guard-profile-periods-repository"
    );
    const profileBackfilled = await backfillAllGuardProfilePeriodsFromCompliance();
    console.log(`[profile-periods] синхронизировано профилей охранников: ${profileBackfilled}`);
    console.log("[post-sync] готово");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
