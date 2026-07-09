-- Скрытие инцидента из глобального баннера без удаления записи на смене.
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS incident_alert_dismissed_at timestamptz NULL;

DROP INDEX IF EXISTS shifts_incident_pending_replacement_idx;

CREATE INDEX IF NOT EXISTS shifts_incident_pending_replacement_idx
  ON shifts (object_id, incident_recorded_at DESC)
  WHERE incident_recorded_at IS NOT NULL
    AND replaced_by_shift_id IS NULL
    AND incident_alert_dismissed_at IS NULL;
