-- Оклад по должности: фиксированная сумма раз в месяц

ALTER TABLE curator_work_entries DROP CONSTRAINT IF EXISTS curator_work_entries_work_type_check;

ALTER TABLE curator_work_entries ADD CONSTRAINT curator_work_entries_work_type_check CHECK (
  work_type IN (
    'RouteObjects',
    'NightInspection',
    'ReplacementShift',
    'MonthlySalary',
    'ScheduleRegular',
    'ScheduleReinforcement',
    'ScheduleRapidResponse'
  )
);

ALTER TABLE curator_work_entries DROP CONSTRAINT IF EXISTS curator_work_entries_hours_check;

ALTER TABLE curator_work_entries ADD CONSTRAINT curator_work_entries_hours_check CHECK (
  (work_type = 'RouteObjects' AND hours IS NOT NULL AND hours > 0)
  OR (work_type = 'NightInspection' AND hours IS NULL)
  OR (work_type = 'ReplacementShift' AND hours IS NOT NULL AND hours > 0)
  OR (work_type = 'MonthlySalary' AND hours IS NULL)
  OR (work_type IN ('ScheduleRegular', 'ScheduleReinforcement', 'ScheduleRapidResponse') AND hours IS NOT NULL AND hours > 0)
);
