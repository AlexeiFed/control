import { describe, expect, it } from "vitest";
import { shiftMatchesPost } from "./shift-post-display";

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
