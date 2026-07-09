import { Pool, type QueryResultRow } from "pg";

let pool: Pool | null = null;

export function getDbPool(): Pool {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required for local PostgreSQL");
  }

  pool ??= new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  return pool;
}

export async function query<T extends QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  const result = await getDbPool().query<T>(text, values);
  return result.rows;
}
