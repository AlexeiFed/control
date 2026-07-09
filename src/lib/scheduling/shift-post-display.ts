/** Смена относится к посту в графике (включая legacy без post_id на первом посту). */
export function shiftMatchesPost(
  shiftPostId: string | null | undefined,
  postId: string | null,
  firstPostId: string | null,
): boolean {
  if (postId == null) return shiftPostId == null;
  if (shiftPostId === postId) return true;
  if (shiftPostId == null && firstPostId && postId === firstPostId) return true;
  return false;
}
