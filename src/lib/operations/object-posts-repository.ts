import { query } from "../db/pool";
import { listMonthlyPostGuardsByObject, replaceMonthlyPostGuards } from "./object-monthly-post-guards-repository";
import { copyShiftTemplatesToPost } from "./shift-templates-repository";

export interface ObjectPost {
  id: string;
  objectId: string;
  month: string;
  name: string;
}

function previousMonthKey(month: string): string | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const month0 = Number(match[2]) - 1;
  const prev = new Date(Date.UTC(year, month0 - 1, 1));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function getObjectPosts(objectId: string, month: string): Promise<ObjectPost[]> {
  const rows = await query<{ id: string; object_id: string; month: string; name: string }>(
    `SELECT id, object_id, month, name
     FROM object_posts
     WHERE object_id = $1 AND month = $2
     ORDER BY created_at ASC`,
    [objectId, month],
  );

  return rows.map((row) => ({
    id: row.id,
    objectId: row.object_id,
    month: row.month,
    name: row.name,
  }));
}

export async function ensureMonthlyPostsInherited(objectId: string, month: string): Promise<void> {
  const existing = await getObjectPosts(objectId, month);
  if (existing.length > 0) return;

  const prevMonth = previousMonthKey(month);
  if (!prevMonth) return;

  const prevPosts = await getObjectPosts(objectId, prevMonth);
  if (prevPosts.length === 0) return;

  for (const post of prevPosts) {
    await createObjectPost(objectId, month, post.name);
  }

  const prevGuards = await listMonthlyPostGuardsByObject(objectId, prevMonth);
  const newPosts = await getObjectPosts(objectId, month);
  const nameToNewId = new Map(newPosts.map((p) => [p.name, p.id]));

  for (const prevPost of prevPosts) {
    const guardIds = prevGuards[prevPost.id];
    const newPostId = nameToNewId.get(prevPost.name);
    if (!newPostId || !guardIds?.length) continue;
    await replaceMonthlyPostGuards(objectId, newPostId, month, guardIds);
  }
}

export async function createObjectPost(
  objectId: string,
  month: string,
  name: string,
): Promise<ObjectPost> {
  const rows = await query<{ id: string }>(
    `INSERT INTO object_posts (object_id, month, name)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [objectId, month, name],
  );

  const postId = rows[0].id;
  await copyShiftTemplatesToPost(objectId, postId);

  return {
    id: postId,
    objectId,
    month,
    name,
  };
}

export async function updateObjectPost(id: string, name: string): Promise<void> {
  await query(`UPDATE object_posts SET name = $1 WHERE id = $2`, [name, id]);
}

export async function deleteObjectPost(id: string): Promise<void> {
  await query(`DELETE FROM object_posts WHERE id = $1`, [id]);
}
