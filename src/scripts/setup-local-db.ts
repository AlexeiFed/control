import "dotenv/config";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  await ensureDatabase(databaseUrl);

  const pool = new Pool({ connectionString: databaseUrl });
  const schema = await readFile(join(process.cwd(), "src", "db", "schema.sql"), "utf8");

  await pool.query(schema);

  console.log("Applying migrations for security_objects, object_holidays and shift_templates...");
  try {
    await pool.query("ALTER TABLE security_objects ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS object_holidays (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        object_id uuid NOT NULL REFERENCES security_objects(id) ON DELETE CASCADE,
        holiday_date date NOT NULL,
        name text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (object_id, holiday_date)
      );
    `);
    await pool.query("ALTER TABLE object_shift_templates ADD COLUMN IF NOT EXISTS shifts_reinforcement_per_day int NOT NULL DEFAULT 0 CHECK (shifts_reinforcement_per_day >= 0);");
    await pool.query("ALTER TABLE object_shift_templates ADD COLUMN IF NOT EXISTS shift_hours int NOT NULL DEFAULT 24 CHECK (shift_hours BETWEEN 1 AND 24);");
    await pool.query("ALTER TABLE object_shift_templates ADD COLUMN IF NOT EXISTS shifts_rapid_response_per_day int NOT NULL DEFAULT 0 CHECK (shifts_rapid_response_per_day >= 0);");
    await pool.query("ALTER TABLE object_shift_templates ADD COLUMN IF NOT EXISTS rapid_response_shift_hours int NOT NULL DEFAULT 24 CHECK (rapid_response_shift_hours BETWEEN 1 AND 24);");
  } catch (e) {
    console.error("Migration error (ignoring if column exists):", e);
  }

  await pool.query(`
    INSERT INTO security_objects (name, address, status)
    VALUES
      ('БЦ Центральный', 'Центральный район', 'Active'),
      ('Склад Север', 'Северный район', 'Active')
    ON CONFLICT DO NOTHING
  `);
  await pool.query(`
    INSERT INTO guards (first_name, last_name, status, license_type)
    VALUES
      ('Иван', 'Петров', 'Active', 'None'),
      ('Анна', 'Смирнова', 'Sick', 'None'),
      ('Олег', 'Ким', 'OnVacation', 'None'),
      ('Мария', 'Волкова', 'Inactive', 'None')
    ON CONFLICT DO NOTHING
  `);
  await pool.query(`
    INSERT INTO holidays (holiday_date, name)
    VALUES ('2026-05-09', 'День Победы (пример)')
    ON CONFLICT (holiday_date) DO NOTHING
  `);
  await pool.query(`
    INSERT INTO object_shift_templates (object_id, day_of_week, shifts_per_day, effective_from)
    SELECT so.id, gs::int,
      CASE WHEN gs BETWEEN 1 AND 5 THEN 2 ELSE 1 END,
      '2026-01-01'::date
    FROM security_objects so
    CROSS JOIN generate_series(1, 7) AS gs
    ON CONFLICT (object_id, day_of_week, effective_from) DO NOTHING
  `);
  await pool.query(`
    INSERT INTO guard_object_assignments (guard_id, object_id)
    SELECT g.id, so.id
    FROM guards g
    CROSS JOIN security_objects so
    WHERE g.last_name = 'Петров' AND so.name = 'БЦ Центральный'
    ON CONFLICT DO NOTHING
  `);
  await pool.query(`
    INSERT INTO shifts (guard_id, object_id, starts_at, ends_at)
    SELECT g.id, so.id, '2026-05-01T08:00:00+10:00'::timestamptz, '2026-05-01T20:00:00+10:00'::timestamptz
    FROM guards g
    JOIN security_objects so ON so.name = 'БЦ Центральный'
    WHERE g.last_name = 'Петров'
      AND NOT EXISTS (
        SELECT 1
        FROM shifts s
        WHERE s.guard_id = g.id
          AND s.object_id = so.id
          AND s.starts_at = '2026-05-01T08:00:00+10:00'::timestamptz
      )
  `);
  await pool.query(`
    INSERT INTO shifts (guard_id, object_id, starts_at, ends_at)
    SELECT g.id, so.id, '2026-05-01T20:00:00+10:00'::timestamptz, '2026-05-02T08:00:00+10:00'::timestamptz
    FROM guards g
    JOIN security_objects so ON so.name = 'БЦ Центральный'
    WHERE g.last_name = 'Петров'
      AND NOT EXISTS (
        SELECT 1
        FROM shifts s
        WHERE s.guard_id = g.id
          AND s.object_id = so.id
          AND s.starts_at = '2026-05-01T20:00:00+10:00'::timestamptz
      )
  `);
  await pool.query(`
    INSERT INTO shift_logs (shift_id, author_user_id, note, incident_level)
    SELECT s.id, 'role:Planner', 'Обход периметра выполнен, замечаний нет.', 'Info'
    FROM shifts s
    WHERE s.starts_at = '2026-05-01T20:00:00+10:00'::timestamptz
      AND NOT EXISTS (
        SELECT 1
        FROM shift_logs sl
        WHERE sl.shift_id = s.id
          AND sl.note = 'Обход периметра выполнен, замечаний нет.'
      )
  `);

  await pool.query(`
    INSERT INTO object_rate_rules (
      object_id,
      name,
      priority,
      days_of_week,
      is_holiday,
      shift_kind,
      starts_at,
      ends_at,
      position,
      license_type,
      employment_type,
      is_trainee,
      client_rate_cents,
      guard_rate_cents,
      rate_unit,
      effective_from,
      effective_to
    )
    SELECT
      so.id,
      d.name,
      d.priority,
      d.days_of_week,
      d.is_holiday,
      d.shift_kind,
      d.starts_at,
      d.ends_at,
      d.position,
      d.license_type,
      d.employment_type,
      d.is_trainee,
      d.client_rate_cents,
      d.guard_rate_cents,
      d.rate_unit,
      d.effective_from,
      d.effective_to
    FROM security_objects so
    CROSS JOIN (
      VALUES
        ('База охранник Б/У', 50, NULL::int[], NULL::boolean, NULL::text,
         NULL::time, NULL::time, 'Guard'::text, 'None'::text, NULL::text, NULL::boolean,
         50000, 30000, 'Hour'::text, '2026-01-01'::date, NULL::date),
        ('Охранник удостоверение У', 55, NULL::int[], NULL::boolean, NULL::text,
         NULL::time, NULL::time, 'Guard'::text, 'Licensed'::text, NULL::text, NULL::boolean,
         55000, 33000, 'Hour'::text, '2026-01-01'::date, NULL::date),
        ('Старший смены', 60, NULL::int[], NULL::boolean, NULL::text,
         NULL::time, NULL::time, 'ShiftLead'::text, NULL::text, NULL::text, NULL::boolean,
         65000, 40000, 'Hour'::text, '2026-01-01'::date, NULL::date),
        ('Стажёр', 70, NULL::int[], NULL::boolean, NULL::text,
         NULL::time, NULL::time, NULL::text, NULL::text, NULL::text, true,
         40000, 25000, 'Hour'::text, '2026-01-01'::date, NULL::date),
        ('Не трудоустроен', 65, NULL::int[], NULL::boolean, NULL::text,
         NULL::time, NULL::time, NULL::text, NULL::text, 'Unemployed'::text, NULL::boolean,
         45000, 28000, 'Hour'::text, '2026-01-01'::date, NULL::date),
        ('Пятница', 80, ARRAY[5]::int[], NULL::boolean, NULL::text,
         NULL::time, NULL::time, NULL::text, NULL::text, NULL::text, NULL::boolean,
         60000, 36000, 'Hour'::text, '2026-01-01'::date, NULL::date),
        ('Праздник', 90, NULL::int[], true, NULL::text,
         NULL::time, NULL::time, NULL::text, NULL::text, NULL::text, NULL::boolean,
         75000, 45000, 'Hour'::text, '2026-01-01'::date, NULL::date),
        ('Усиление', 85, NULL::int[], NULL::boolean, 'Reinforcement'::text,
         NULL::time, NULL::time, NULL::text, NULL::text, NULL::text, NULL::boolean,
         120000, 70000, 'Shift'::text, '2026-01-01'::date, NULL::date)
    ) AS d(
      name,
      priority,
      days_of_week,
      is_holiday,
      shift_kind,
      starts_at,
      ends_at,
      position,
      license_type,
      employment_type,
      is_trainee,
      client_rate_cents,
      guard_rate_cents,
      rate_unit,
      effective_from,
      effective_to
    )
    WHERE so.name = 'БЦ Центральный'
      AND NOT EXISTS (
        SELECT 1
        FROM object_rate_rules r
        WHERE r.object_id = so.id
          AND r.name = d.name
      )
  `);

  await pool.end();
  console.log("Локальная PostgreSQL база готова");
}

async function ensureDatabase(databaseUrl: string): Promise<void> {
  const targetUrl = new URL(databaseUrl);
  const databaseName = targetUrl.pathname.replace("/", "");
  if (!databaseName) throw new Error("DATABASE_URL must include database name");

  const maintenanceUrl = new URL(databaseUrl);
  maintenanceUrl.pathname = "/postgres";
  const pool = new Pool({ connectionString: maintenanceUrl.toString() });

  try {
    const exists = await pool.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1) AS exists",
      [databaseName],
    );

    if (!exists.rows[0]?.exists) {
      await pool.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    }
  } finally {
    await pool.end();
  }
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
