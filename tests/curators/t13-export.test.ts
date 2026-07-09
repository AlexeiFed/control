/**
 * Назначение файла: регресс-тесты генератора CSV табеля Т-13 по кураторам.
 * Проверяем структуру таблицы, итоги и excel-friendly префикс BOM.
 */

import { describe, expect, it } from "vitest";
import { buildCuratorT13Csv } from "../../src/lib/curators/t13-export";

describe("buildCuratorT13Csv", () => {
  it("строит табличный CSV с днями, итогами и BOM", () => {
    const csv = buildCuratorT13Csv({
      startInclusive: "2026-05-01",
      endInclusive: "2026-05-03",
      periodLabel: "Месяц (2026-05-01..2026-05-31)",
      entries: [
        {
          curatorId: "c1",
          curatorName: "Иванов Иван",
          workDate: "2026-05-01",
          totalHours: 8,
          totalRub: 2620,
        },
        {
          curatorId: "c1",
          curatorName: "Иванов Иван",
          workDate: "2026-05-02",
          totalHours: 4,
          totalRub: 1300,
        },
        {
          curatorId: "c2",
          curatorName: "Петров Пётр",
          workDate: "2026-05-02",
          totalHours: 12,
          totalRub: 4000,
        },
      ],
    });

    expect(csv.startsWith("\uFEFF")).toBe(true);

    const rows = csv.replace("\uFEFF", "").split("\n");
    expect(rows[0]).toContain("ФИО;Период;01;02;03;Итого часов;Итого, ₽");
    expect(rows[1]).toContain("Иванов Иван");
    expect(rows[1]).toContain("8 ч / 2 620");
    expect(rows[1]).toContain("12 ч");
    expect(rows[2]).toContain("Петров Пётр");
    expect(rows[3]).toContain("ИТОГО");
    expect(rows[3]).toContain("24 ч");
    expect(rows[3]).toContain("7 920");
  });
});
