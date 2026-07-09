import { describe, expect, it } from "vitest";
import {
  complianceReminderBannerFingerprint,
  needsPeriodicCheckReminder,
  needsPeriodicCheckReminderAfterPersonalCard,
  needsPeriodicCheckReminderForGuard,
  periodicCheckExpiryIso,
  PERIODIC_CHECK_REMINDER_DAYS,
  PERSONAL_CARD_PERIODIC_CHECK_GRACE_DAYS,
} from "./periodic-check";

describe("periodicCheckExpiryIso", () => {
  it("adds one calendar year", () => {
    expect(periodicCheckExpiryIso("2024-03-15")).toBe("2025-03-15");
  });
});

describe("needsPeriodicCheckReminder", () => {
  it("is false when expiry is more than reminder window away", () => {
    expect(needsPeriodicCheckReminder("2024-01-01", "2024-06-01")).toBe(false);
  });

  it("is true within 60 days before expiry", () => {
    expect(needsPeriodicCheckReminder("2024-06-01", "2025-04-15")).toBe(true);
  });

  it("is true when expired", () => {
    expect(needsPeriodicCheckReminder("2023-01-01", "2025-05-19")).toBe(true);
  });

  it("is true when passed about two years ago", () => {
    expect(needsPeriodicCheckReminder("2024-05-19", "2026-05-21")).toBe(true);
  });
});

describe("needsPeriodicCheckReminderAfterPersonalCard", () => {
  it("is false before 30 days from personal card", () => {
    expect(
      needsPeriodicCheckReminderAfterPersonalCard("2025-01-01", null, "2025-01-20"),
    ).toBe(false);
  });

  it("is true from day 30 without periodic check", () => {
    expect(
      needsPeriodicCheckReminderAfterPersonalCard("2025-01-01", null, "2025-01-31"),
    ).toBe(true);
  });

  it("is false when periodic check exists", () => {
    expect(
      needsPeriodicCheckReminderAfterPersonalCard("2025-01-01", "2025-01-15", "2025-02-15"),
    ).toBe(false);
  });
});

describe("needsPeriodicCheckReminderForGuard", () => {
  it("uses expiry rule when periodic check is set", () => {
    expect(
      needsPeriodicCheckReminderForGuard("2024-01-01", "2025-01-01", "2024-06-01"),
    ).toBe(false);
  });

  it("uses personal card rule when periodic check is missing", () => {
    expect(
      needsPeriodicCheckReminderForGuard(null, "2025-01-01", "2025-02-01"),
    ).toBe(true);
  });
});

describe("complianceReminderBannerFingerprint", () => {
  it("changes when expiry changes for same guard", () => {
    const a = complianceReminderBannerFingerprint([
      { guardId: "g1", passedOn: "2024-05-19", expiryIso: "2025-05-19" },
    ]);
    const b = complianceReminderBannerFingerprint([
      { guardId: "g1", passedOn: "2022-05-19", expiryIso: "2023-05-19" },
    ]);
    expect(a).not.toBe(b);
  });

  it("changes when reminder kind changes", () => {
    const a = complianceReminderBannerFingerprint([
      {
        guardId: "g1",
        reminderKind: "expiry",
        passedOn: "2024-05-19",
        expiryIso: "2025-05-19",
      },
    ]);
    const b = complianceReminderBannerFingerprint([
      {
        guardId: "g1",
        reminderKind: "personal_card",
        passedOn: "2024-05-19",
        expiryIso: "2024-06-18",
      },
    ]);
    expect(a).not.toBe(b);
  });
});

describe("PERSONAL_CARD_PERIODIC_CHECK_GRACE_DAYS", () => {
  it("is 30", () => {
    expect(PERSONAL_CARD_PERIODIC_CHECK_GRACE_DAYS).toBe(30);
  });
});
