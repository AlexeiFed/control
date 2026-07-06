import { query } from "../../db/db";

export interface ObjectPost {
  id: string;
  objectId: string;
  name: string;
}

export async function getObjectPosts(objectId: string): Promise<ObjectPost[]> {
  const rows = await query<{ id: string; object_id: string; name: string }>(
    `SELECT id, object_id, name
     FROM object_posts
     WHERE object_id = $1
     ORDER BY created_at ASC`,
    [objectId]
  );

  return rows.map((row: any) => ({
    id: row.id,
    objectId: row.object_id,
    name: row.name,
  }));
}

export async function createObjectPost(objectId: string, name: string): Promise<ObjectPost> {
  const rows = await query<{ id: string }>(
    `INSERT INTO object_posts (object_id, name)
     VALUES ($1, $2)
     RETURNING id`,
    [objectId, name]
  );

  return {
    id: rows[0].id,
    objectId,
    name,
  };
}

export async function updateObjectPost(id: string, name: string): Promise<void> {
  await query(
    `UPDATE object_posts SET name = $1 WHERE id = $2`,
    [name, id]
  );
}

export async function deleteObjectPost(id: string): Promise<void> {
  await query(`DELETE FROM object_posts WHERE id = $1`, [id]);
}
