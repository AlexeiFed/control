import { describe, expect, it } from "vitest";
import {
  extractRuPhoneDigits,
  formatRuPhoneFromDigits,
  isValidRuPhone,
  normalizeRuPhoneForStorage,
} from "../../src/lib/format/phone-ru";

describe("phone-ru", () => {
  it("formats full number", () => {
    expect(formatRuPhoneFromDigits("9123456789")).toBe("+7 (912) 345 67 89");
  });

  it("accepts empty or complete numbers only", () => {
    expect(isValidRuPhone("")).toBe(true);
    expect(isValidRuPhone("+7 (912) 345 67 89")).toBe(true);
    expect(isValidRuPhone("+7 (912) 345")).toBe(false);
  });

  it("strips leading 8/7", () => {
    expect(extractRuPhoneDigits("89123456789")).toBe("9123456789");
    expect(normalizeRuPhoneForStorage("8 (912) 345-67-89")).toBe("+7 (912) 345 67 89");
  });

  it("allows any first national digit including 8", () => {
    expect(formatRuPhoneFromDigits("8940681917")).toBe("+7 (894) 068 19 17");
    expect(formatRuPhoneFromDigits("8")).toBe("+7 (8");
    expect(isValidRuPhone("+7 (894) 068 19 17")).toBe(true);
    expect(formatRuPhoneFromDigits("87940681917")).toBe("+7 (794) 068 19 17");
  });

  it("keeps +7 from mask when parsing display value", () => {
    expect(extractRuPhoneDigits("+7 (894) 068 19 17")).toBe("8940681917");
    expect(extractRuPhoneDigits("+7 (794) 068 19 17")).toBe("7940681917");
  });

  it("allows national numbers starting with 7", () => {
    expect(formatRuPhoneFromDigits("7")).toBe("+7 (7");
    expect(formatRuPhoneFromDigits("77")).toBe("+7 (77");
    expect(formatRuPhoneFromDigits("7940681917")).toBe("+7 (794) 068 19 17");
    expect(extractRuPhoneDigits("+7 (77")).toBe("77");
    expect(isValidRuPhone("+7 (794) 068 19 17")).toBe(true);
  });
});
