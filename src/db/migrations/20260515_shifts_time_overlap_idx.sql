-- Ускорение выборки смен по месяцу/диапазону для табеля и агрегатов.
CREATE INDEX IF NOT EXISTS shifts_time_overlap_idx ON shifts (starts_at, ends_at);
