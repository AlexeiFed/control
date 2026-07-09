-- Удостоверение (Б/У, У) для всех должностей: Guard, ShiftLead, Curator
ALTER TABLE guards DROP CONSTRAINT IF EXISTS guards_position_license_check;

UPDATE guards SET license_type = 'None' WHERE license_type IS NULL;

ALTER TABLE guards ADD CONSTRAINT guards_position_license_check CHECK (
  license_type IN ('None', 'Licensed')
);
