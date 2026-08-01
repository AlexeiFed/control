import { describe, expect, it } from "vitest";
import { formatGuardAssignmentLabel, sortGuardsForShiftAssignment } from "./guard-car-sort";

describe("sortGuardsForShiftAssignment", () => {
  const guards = [
    { id: "1", name: "Борисов", hasCar: false, employmentType: "Unemployed" as const },
    { id: "2", name: "Абрамов", hasCar: true, employmentType: "Employed" as const },
    { id: "3", name: "Васильев", hasCar: false, employmentType: "Employed" as const },
    { id: "4", name: "Бельчиков", hasCar: true, employmentType: "Unemployed" as const },
  ];

  it("сортирует штатных первыми для обычной смены", () => {
    const sorted = sortGuardsForShiftAssignment(guards, "Regular", (a, b) =>
      a.name.localeCompare(b.name, "ru-RU"),
    );
    expect(sorted.map((g) => g.name)).toEqual(["Абрамов", "Васильев", "Бельчиков", "Борисов"]);
  });

  it("поднимает штатных с авто вверх для МП", () => {
    const sorted = sortGuardsForShiftAssignment(guards, "RapidResponse", (a, b) =>
      a.name.localeCompare(b.name, "ru-RU"),
    );
    expect(sorted.map((g) => g.name)).toEqual(["Абрамов", "Васильев", "Бельчиков", "Борисов"]);
  });
});

describe("formatGuardAssignmentLabel", () => {
  it("добавляет пометку авто при наличии машины для любого типа смены", () => {
    expect(formatGuardAssignmentLabel("Иванов", true, "RapidResponse")).toBe("Иванов · авто");
    expect(formatGuardAssignmentLabel("Иванов", true, "Regular")).toBe("Иванов · авто");
    expect(formatGuardAssignmentLabel("Иванов", true, "Reinforcement")).toBe("Иванов · авто");
    expect(formatGuardAssignmentLabel("Иванов", false, "RapidResponse")).toBe("Иванов");
  });
});
