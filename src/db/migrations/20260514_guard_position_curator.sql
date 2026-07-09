-- Должность охранника «Куратор» (как у старшего смены — без удостоверения в БД)

ALTER TABLE guards DROP CONSTRAINT IF EXISTS guards_position_check;
ALTER TABLE guards ADD CONSTRAINT guards_position_check CHECK (position IN ('ShiftLead', 'Guard', 'Curator'));

ALTER TABLE guards DROP CONSTRAINT IF EXISTS guards_position_license_check;
ALTER TABLE guards ADD CONSTRAINT guards_position_license_check CHECK (
  (position IN ('ShiftLead', 'Curator') AND license_type IS NULL)
  OR (position = 'Guard' AND license_type IN ('None', 'Licensed'))
);

ALTER TABLE object_rate_rules DROP CONSTRAINT IF EXISTS object_rate_rules_position_check;
ALTER TABLE object_rate_rules ADD CONSTRAINT object_rate_rules_position_check CHECK (
  position IS NULL OR position IN ('ShiftLead', 'Guard', 'Curator')
);
