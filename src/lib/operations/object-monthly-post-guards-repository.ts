import { query } from "../db/pool";

export type MonthlyPostGuardsByPostId = Record<string, string[]>;

export async function listMonthlyPostGuardsByObject(
  objectId: string,
  month: string,
): Promise<MonthlyPostGuardsByPostId> {
  const rows = await query<{ post_id: string; guard_id: string }>(
    `SELECT post_id, guard_id
     FROM object_monthly_post_guards
     WHERE object_id = $1 AND month = $2
     ORDER BY created_at ASC`,
    [objectId, month],
  );

  const map: MonthlyPostGuardsByPostId = {};
  for (const row of rows) {
    if (!map[row.post_id]) map[row.post_id] = [];
    map[row.post_id].push(row.guard_id);
  }
  return map;
}

/** Добавляет одного охранника на пост. Остальной штат и смены не трогает. */
export async function addGuardToMonthlyPost(
  objectId: string,
  postId: string,
  month: string,
  guardId: string,
): Promise<void> {
  await query(
    `INSERT INTO object_monthly_post_guards (object_id, post_id, guard_id, month)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (post_id, guard_id, month) DO NOTHING`,
    [objectId, postId, guardId, month],
  );
}

/** Убирает одного охранника с поста. Смены и штат других постов не трогает. */
export async function removeGuardFromMonthlyPost(
  postId: string,
  month: string,
  guardId: string,
): Promise<void> {
  await query(
    `DELETE FROM object_monthly_post_guards
     WHERE post_id = $1 AND month = $2 AND guard_id = $3`,
    [postId, month, guardId],
  );
}

export async function replaceMonthlyPostGuards(
  objectId: string,
  postId: string,
  month: string,
  guardIds: string[],
): Promise<void> {
  await query(
    `DELETE FROM object_monthly_post_guards
     WHERE post_id = $1 AND month = $2`,
    [postId, month],
  );

  if (guardIds.length === 0) return;

  const values: string[] = [];
  const params: string[] = [objectId, postId, month];
  guardIds.forEach((guardId, index) => {
    const base = index + 4;
    values.push(`($1, $2, $${base}, $3)`);
    params.push(guardId);
  });

  await query(
    `INSERT INTO object_monthly_post_guards (object_id, post_id, guard_id, month)
     VALUES ${values.join(", ")}`,
    params,
  );
}

export async function deleteGuardFromObjectMonthStaff(
  objectId: string,
  guardId: string,
  month: string,
): Promise<void> {
  await query(
    `DELETE FROM object_monthly_post_guards
     WHERE object_id = $1 AND guard_id = $2 AND month = $3`,
    [objectId, guardId, month],
  );
}
