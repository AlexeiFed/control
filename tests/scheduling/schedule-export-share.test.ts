import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deliverExportFile,
  getMaxDeliveryToastMessage,
  openMaxSharePicker,
} from "../../src/lib/scheduling/schedule-export-share";

describe("schedule-export-share", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shares MAX export via system share on mobile", async () => {
    const createdAnchors: Array<{ click: ReturnType<typeof vi.fn> }> = [];
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);

    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      canShare,
      share,
    });
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:export"),
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal("document", {
      createElement: vi.fn(() => {
        const anchor = { click: vi.fn() };
        createdAnchors.push(anchor);
        return anchor;
      }),
    });
    vi.stubGlobal("window", { open: vi.fn() });

    const blob = new Blob(["jpg"], { type: "image/jpeg" });
    const result = await deliverExportFile(blob, "schedule.jpg", "График смен", "max");

    expect(result).toEqual({ method: "system-share", filename: "schedule.jpg" });
    expect(share).toHaveBeenCalledTimes(1);
    expect(createdAnchors).toHaveLength(0);
    expect(window.open).not.toHaveBeenCalled();
    expect(getMaxDeliveryToastMessage(result!)).toBe("Выберите MAX в системном меню отправки");
  });

  it("downloads file and opens MAX chat picker on macOS desktop", async () => {
    const createdAnchors: Array<{ click: ReturnType<typeof vi.fn>; download?: string }> = [];
    const windowOpen = vi.fn();

    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    });
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:export"),
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal("document", {
      createElement: vi.fn(() => {
        const anchor = { click: vi.fn(), download: undefined };
        createdAnchors.push(anchor);
        return anchor;
      }),
    });
    vi.stubGlobal("window", { open: windowOpen });

    const blob = new Blob(["jpg"], { type: "image/jpeg" });
    const result = await deliverExportFile(blob, "schedule.jpg", "График смен", "max");

    expect(result).toEqual({ method: "max-picker", filename: "schedule.jpg" });
    expect(createdAnchors).toHaveLength(1);
    expect(createdAnchors[0]?.click).toHaveBeenCalledTimes(1);
    expect(windowOpen).toHaveBeenCalledWith(
      expect.stringContaining("https://max.ru/:share?text="),
      "_blank",
      "noopener,noreferrer",
    );
    expect(getMaxDeliveryToastMessage(result!)).toBe("Файл в Загрузках — в MAX выберите чат и прикрепите файл");
  });

  it("downloads file and opens MAX chat picker on Windows desktop", async () => {
    const createdAnchors: Array<{ click: ReturnType<typeof vi.fn> }> = [];
    const share = vi.fn();
    const windowOpen = vi.fn();

    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      share,
      canShare: vi.fn().mockReturnValue(true),
    });
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:export"),
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal("document", {
      createElement: vi.fn(() => {
        const anchor = { click: vi.fn() };
        createdAnchors.push(anchor);
        return anchor;
      }),
    });
    vi.stubGlobal("window", { open: windowOpen });

    const blob = new Blob(["xlsx"], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const result = await deliverExportFile(blob, "schedule.xlsx", "График смен", "max");

    expect(result).toEqual({ method: "max-picker", filename: "schedule.xlsx" });
    expect(share).not.toHaveBeenCalled();
    expect(createdAnchors).toHaveLength(1);
    expect(windowOpen).toHaveBeenCalledWith(
      expect.stringContaining("https://max.ru/:share?text="),
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("encodes caption and hint for MAX share picker", () => {
    const windowOpen = vi.fn();
    vi.stubGlobal("window", { open: windowOpen });

    openMaxSharePicker("График", "Подсказка");

    expect(windowOpen).toHaveBeenCalledWith(
      `https://max.ru/:share?text=${encodeURIComponent("График\n\nПодсказка")}`,
      "_blank",
      "noopener,noreferrer",
    );
  });
});
