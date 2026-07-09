import "dotenv/config";
import { backfillCuratorShiftEntries } from "../lib/curators/sync-shift-entry";

async function main() {
  const fromDate = process.argv[2] ?? "2026-04-01";
  const count = await backfillCuratorShiftEntries(fromDate, "backfill-script");
  console.log(`Синхронизировано смен: ${count} (с ${fromDate})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
