-- Подписи «УТВЕРЖДАЮ» и «Начальник участка» в Excel-табеле по объекту.
ALTER TABLE security_objects
  ADD COLUMN IF NOT EXISTS timesheet_director_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS timesheet_director_role text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS timesheet_site_manager_enabled boolean NOT NULL DEFAULT false;
