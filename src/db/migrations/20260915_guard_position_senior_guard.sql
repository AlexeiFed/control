-- Должность «Старший охранник»

ALTER TABLE guards DROP CONSTRAINT IF EXISTS guards_position_check;
ALTER TABLE guards ADD CONSTRAINT guards_position_check
  CHECK (position IN ('ShiftLead', 'Guard', 'Curator', 'SeniorGuard'));

ALTER TABLE object_rate_rules DROP CONSTRAINT IF EXISTS object_rate_rules_position_check;
ALTER TABLE object_rate_rules ADD CONSTRAINT object_rate_rules_position_check CHECK (
  position IS NULL OR position IN ('ShiftLead', 'Guard', 'Curator', 'SeniorGuard')
);

ALTER TABLE guard_profile_periods DROP CONSTRAINT IF EXISTS guard_profile_periods_position_check;
ALTER TABLE guard_profile_periods ADD CONSTRAINT guard_profile_periods_position_check CHECK (
  position IS NULL OR position IN ('ShiftLead', 'Guard', 'Curator', 'SeniorGuard')
);
