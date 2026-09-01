import { describe, expect, it } from "vitest";
import {
  monthScheduleRemovalScope,
  scheduleRowHideKey,
  shiftMatchesPost,
} from "./shift-post-display";

describe("shiftMatchesPost", () => {
  const first = "post-1";
  const second = "post-2";

  it("matches exact post", () => {
    expect(shiftMatchesPost(second, second, first)).toBe(true);
  });

  it("shows legacy null post only on first post", () => {
    expect(shiftMatchesPost(null, first, first)).toBe(true);
    expect(shiftMatchesPost(null, second, first)).toBe(false);
  });

  it("without posts matches only null post section", () => {
    expect(shiftMatchesPost(null, null, null)).toBe(true);
    expect(shiftMatchesPost(first, null, null)).toBe(false);
  });
});

describe("monthScheduleRemovalScope", () => {
  const first = "post-1";
  const second = "post-2";

  it("без постов — весь объект", () => {
    expect(monthScheduleRemovalScope(null, null)).toEqual({
      scope: "object",
      includeLegacyNullPostShifts: true,
      clearMonthRoster: true,
      clearObjectAssignment: true,
    });
  });

  it("корзина на втором посту не трогает объект и другие посты", () => {
    expect(monthScheduleRemovalScope(second, first)).toEqual({
      scope: "post",
      includeLegacyNullPostShifts: false,
      clearMonthRoster: false,
      clearObjectAssignment: false,
    });
  });

  it("первый пост: смены без post_id и плоский штат месяца, пул объекта нет", () => {
    expect(monthScheduleRemovalScope(first, first)).toEqual({
      scope: "post",
      includeLegacyNullPostShifts: true,
      clearMonthRoster: true,
      clearObjectAssignment: false,
    });
  });
});

describe("scheduleRowHideKey", () => {
  it("разные посты — разные ключи одного охранника", () => {
    expect(scheduleRowHideKey("a", "g1")).not.toBe(scheduleRowHideKey("b", "g1"));
  });
});
