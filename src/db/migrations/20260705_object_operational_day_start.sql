-- Начало операционных суток объекта (суточная смена anchor→anchor следующего дня).
ALTER TABLE security_objects
  ADD COLUMN IF NOT EXISTS operational_day_start_time time NOT NULL DEFAULT '08:00:00';
