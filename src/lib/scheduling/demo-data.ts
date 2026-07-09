import {
  createSchedulerGuard,
  createSchedulerShift,
  type Guard,
  type SecurityObject,
  type Shift,
  type ShiftLog,
} from "./types";

export const demoObjects: SecurityObject[] = [
  {
    id: "obj-central",
    name: "БЦ Центральный",
    address: "Sydney CBD",
    status: "Active",
    operationalDayStartTime: "08:00",
  },
  {
    id: "obj-warehouse",
    name: "Склад Север",
    address: "North Ryde",
    status: "Active",
    operationalDayStartTime: "08:00",
  },
];

export const demoGuards: Guard[] = [
  createSchedulerGuard({ id: "guard-ivan", name: "Иван Петров", status: "Active" }),
  createSchedulerGuard({ id: "guard-anna", name: "Анна Смирнова", status: "Sick" }),
  createSchedulerGuard({ id: "guard-oleg", name: "Олег Ким", status: "OnVacation" }),
  createSchedulerGuard({ id: "guard-maria", name: "Мария Волкова", status: "Inactive" }),
];

export const demoShifts: Shift[] = [
  createSchedulerShift({
    id: "shift-day",
    guardId: "guard-ivan",
    objectId: "obj-central",
    startsAt: new Date("2026-05-01T08:00:00+10:00"),
    endsAt: new Date("2026-05-01T20:00:00+10:00"),
  }),
  createSchedulerShift({
    id: "shift-night",
    guardId: "guard-ivan",
    objectId: "obj-central",
    startsAt: new Date("2026-05-01T20:00:00+10:00"),
    endsAt: new Date("2026-05-02T08:00:00+10:00"),
  }),
];

export const demoShiftLogs: ShiftLog[] = [
  {
    id: "log-1",
    shiftId: "shift-night",
    authorUserId: "role:Planner",
    createdAt: new Date("2026-05-01T22:10:00+10:00"),
    note: "Обход периметра выполнен, замечаний нет.",
    incidentLevel: "Info",
  },
];
