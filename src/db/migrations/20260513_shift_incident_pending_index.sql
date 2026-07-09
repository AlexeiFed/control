-- Индекс для выборки незакрытых замен по инциденту (баннер, отчёты)
CREATE INDEX IF NOT EXISTS shifts_incident_pending_replacement_idx
  ON shifts (object_id, incident_recorded_at DESC)
  WHERE incident_recorded_at IS NOT NULL AND replaced_by_shift_id IS NULL;
