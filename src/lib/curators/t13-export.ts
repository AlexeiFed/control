/**
 * Назначение файла: генерация CSV-выгрузки табеля Т-13 по кураторам.
 * Формат оптимизирован под открытие в Excel (UTF-8 BOM + ; как разделитель).
 */

export type CuratorT13Entry = {
  curatorId: string;
  curatorName: string;
  workDate: string;
  totalHours: number;
  totalRub: number;
};

export type CuratorT13ExportInput = {
  startInclusive: string;
  endInclusive: string;
  periodLabel: string;
  entries: CuratorT13Entry[];
};

export function buildCuratorT13Csv(input: CuratorT13ExportInput): string {
  const dates = buildIsoDateRange(input.startInclusive, input.endInclusive);
  const byCurator = new Map<string, { name: string; dayMap: Map<string, CuratorT13Entry> }>();

  for (const entry of input.entries) {
    const existing = byCurator.get(entry.curatorId);
    if (existing) {
      existing.dayMap.set(entry.workDate, entry);
      continue;
    }

    byCurator.set(entry.curatorId, {
      name: entry.curatorName,
      dayMap: new Map([[entry.workDate, entry]]),
    });
  }

  const header = [
    "ФИО",
    "Период",
    ...dates.map((iso) => iso.slice(8, 10)),
    "Итого часов",
    "Итого, ₽",
  ];

  const rows: string[] = [header.map(escapeCsvCell).join(";")];
  const totalsByDay = new Map<string, { totalHours: number; totalRub: number }>();
  let grandHours = 0;
  let grandRub = 0;

  const sortedCurators = Array.from(byCurator.values()).sort((a, b) => a.name.localeCompare(b.name, "ru"));

  for (const curator of sortedCurators) {
    let curatorHours = 0;
    let curatorRub = 0;
    const dayCells = dates.map((dateIso) => {
      const entry = curator.dayMap.get(dateIso);
      if (!entry) return "";

      curatorHours += entry.totalHours;
      curatorRub += entry.totalRub;

      const dayTotals = totalsByDay.get(dateIso) ?? { totalHours: 0, totalRub: 0 };
      dayTotals.totalHours += entry.totalHours;
      dayTotals.totalRub += entry.totalRub;
      totalsByDay.set(dateIso, dayTotals);

      return `${formatHours(entry.totalHours)} ч / ${formatRub(entry.totalRub)}`;
    });

    grandHours += curatorHours;
    grandRub += curatorRub;

    rows.push(
      [
        curator.name,
        input.periodLabel,
        ...dayCells,
        `${formatHours(curatorHours)} ч`,
        formatRub(curatorRub),
      ]
        .map(escapeCsvCell)
        .join(";"),
    );
  }

  const summaryCells = dates.map((dateIso) => {
    const totals = totalsByDay.get(dateIso);
    if (!totals) return "";
    return `${formatHours(totals.totalHours)} ч / ${formatRub(totals.totalRub)}`;
  });

  rows.push(
    ["ИТОГО", input.periodLabel, ...summaryCells, `${formatHours(grandHours)} ч`, formatRub(grandRub)]
      .map(escapeCsvCell)
      .join(";"),
  );

  return `\uFEFF${rows.join("\n")}`;
}

function buildIsoDateRange(startInclusive: string, endInclusive: string): string[] {
  const result: string[] = [];
  const cursor = new Date(`${startInclusive}T00:00:00Z`);
  const end = new Date(`${endInclusive}T00:00:00Z`);

  while (cursor <= end) {
    result.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return result;
}

function formatHours(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

function formatRub(value: number): string {
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

function escapeCsvCell(value: string): string {
  if (!/[";\n\r]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}
