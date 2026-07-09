import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import "dotenv/config";
import { buildPayrollStatementSheets } from "../lib/accounting/payroll-statement";
import { buildPayrollStatementWorkbook } from "../lib/accounting/payroll-statement-xlsx";
import { listTimesheetEntries, listTimesheetFilterOptions } from "../lib/accounting/timesheet-entries-repository";
import { sumAdvancesByGuardForMonth } from "../lib/operations/advances-repository";
import type { PayrollHalf } from "../lib/payroll/advance-period";
import { monthEndKhabarovsk, monthStartKhabarovsk } from "../lib/payroll/advance-period";

type CliArgs = {
  month: string;
  periodHalf: PayrollHalf;
  objectId?: string;
  outPath: string;
};

function parseArgs(argv: string[]): CliArgs {
  let month = "";
  let periodHalf: PayrollHalf = "first";
  let objectId: string | undefined;
  let outPath = "";

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--month") month = argv[++i] ?? "";
    else if (arg === "--periodHalf") periodHalf = (argv[++i] ?? "first") as PayrollHalf;
    else if (arg === "--objectId") objectId = argv[++i];
    else if (arg === "--out") outPath = argv[++i] ?? "";
  }

  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("Укажите --month YYYY-MM");
  }
  if (periodHalf !== "first" && periodHalf !== "second") {
    throw new Error("Укажите --periodHalf first или second");
  }
  if (!outPath) {
    throw new Error("Укажите --out путь к .xlsx");
  }

  return { month, periodHalf, objectId, outPath };
}

function monthRange(month: string): { year: number; monthIndex0: number; start: Date; end: Date } {
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthIndex0 = Number(monthStr) - 1;
  return {
    year,
    monthIndex0,
    start: monthStartKhabarovsk(year, monthIndex0),
    end: monthEndKhabarovsk(year, monthIndex0),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { year, monthIndex0, start, end } = monthRange(args.month);

  const [rows, filterOptions, advancesByGuardId] = await Promise.all([
    listTimesheetEntries(start, end, { objectId: args.objectId }),
    listTimesheetFilterOptions(),
    sumAdvancesByGuardForMonth(year, monthIndex0),
  ]);

  const objects = await loadObjects(args.objectId);
  const guardIdByName = new Map(filterOptions.guards.map((g) => [g.name, g.id] as const));

  const sheets = buildPayrollStatementSheets({
    rows,
    objects,
    half: args.periodHalf,
    year,
    monthIndex0,
    guardIdByName,
    advancesByGuardId,
    objectIdFilter: args.objectId,
  });

  if (sheets.length === 0) {
    throw new Error("Нет смен за выбранный период");
  }

  const buffer = await buildPayrollStatementWorkbook(sheets, year, monthIndex0, args.periodHalf);
  const outPath = resolve(args.outPath);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, buffer);
  console.log(outPath);
}

async function loadObjects(objectId?: string): Promise<Array<{ id: string; name: string; address: string }>> {
  const { query } = await import("../lib/db/pool");
  const rows = await query<{ id: string; name: string; address: string }>(
    objectId
      ? `SELECT id, name, address FROM security_objects WHERE id = $1::uuid`
      : `SELECT id, name, address FROM security_objects ORDER BY name`,
    objectId ? [objectId] : [],
  );
  return rows;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
