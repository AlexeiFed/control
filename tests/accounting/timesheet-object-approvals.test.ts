import { describe, expect, it } from "vitest";
import {
  buildTimesheetApprovalBlocks,
  formatTimesheetApprovalSignature,
  TIMESHEET_APPROVAL_SIGNATURE_BLANK,
} from "../../src/lib/accounting/timesheet-object-approvals";

describe("buildTimesheetApprovalBlocks", () => {
  it("скрывает начальника участка, если не включён", () => {
    const blocks = buildTimesheetApprovalBlocks({
      directorRole: 'Директор ООО "СЗ ДАУП"',
      directorName: "М.А.Плотников",
      siteManagerEnabled: false,
    });

    expect(blocks.map((b) => b.header)).toEqual(["СОГЛАСОВАНО", "УТВЕРЖДАЮ:"]);
    expect(blocks[1]?.role).toBe('Директор ООО "СЗ ДАУП"');
    expect(blocks[1]?.signature).toBe("______________/М.А.Плотников/");
  });

  it("показывает начальника участка, если включён", () => {
    const blocks = buildTimesheetApprovalBlocks({
      directorRole: "",
      directorName: "",
      siteManagerEnabled: true,
    });

    expect(blocks.map((b) => b.header)).toEqual(["СОГЛАСОВАНО:", "СОГЛАСОВАНО", "УТВЕРЖДАЮ:"]);
    expect(blocks[0]?.role).toBe("Начальник участка");
  });

  it("подставляет должность по умолчанию", () => {
    const blocks = buildTimesheetApprovalBlocks({
      directorRole: "",
      directorName: "",
      siteManagerEnabled: false,
    });

    expect(blocks.at(-1)?.role).toBe("Директор");
    expect(blocks.at(-1)?.signature).toBe(TIMESHEET_APPROVAL_SIGNATURE_BLANK);
  });
});

describe("formatTimesheetApprovalSignature", () => {
  it("формирует строку подписи", () => {
    expect(formatTimesheetApprovalSignature("М.Ю.Грачевский")).toBe("______________/М.Ю.Грачевский/");
    expect(formatTimesheetApprovalSignature("")).toBe(TIMESHEET_APPROVAL_SIGNATURE_BLANK);
  });
});
