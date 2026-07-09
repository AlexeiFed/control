import "dotenv/config";
import { Pool } from "pg";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const pool = new Pool({ connectionString: databaseUrl });
  
  console.log("Adding description column to security_objects...");
  try {
    await pool.query("ALTER TABLE security_objects ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';");
    console.log("Column description added.");
  } catch (e) {
    console.error("Error adding description column:", e);
  }

  console.log("Creating object_holidays table...");
  try {
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
    console.log("Table object_holidays created.");
  } catch (e) {
    console.error("Error creating object_holidays table:", e);
  }

  await pool.end();
}

main().catch(console.error);
