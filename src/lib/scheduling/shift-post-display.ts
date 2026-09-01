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

/** Корзина в строке поста: не сносить штат/смены других постов. */
export function monthScheduleRemovalScope(
  postId: string | null | undefined,
  firstPostId: string | null,
): {
  scope: "object" | "post";
  includeLegacyNullPostShifts: boolean;
  clearMonthRoster: boolean;
  clearObjectAssignment: boolean;
} {
  if (!postId) {
    return {
      scope: "object",
      includeLegacyNullPostShifts: true,
      clearMonthRoster: true,
      clearObjectAssignment: true,
    };
  }
  const isFirst = Boolean(firstPostId) && postId === firstPostId;
  return {
    scope: "post",
    includeLegacyNullPostShifts: isFirst,
    clearMonthRoster: isFirst,
    clearObjectAssignment: false,
  };
}

export function scheduleRowHideKey(postId: string | null | undefined, guardId: string): string {
  return `${postId ?? ""}:${guardId}`;
}
