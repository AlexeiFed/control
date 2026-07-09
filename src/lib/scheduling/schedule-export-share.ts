const MAX_SHARE_BASE = "https://max.ru/:share";

export type ExportDeliveryMode = "download" | "max";
export type MaxDeliveryMethod = "system-share" | "max-picker";

export type MaxDeliveryResult = {
  method: MaxDeliveryMethod;
  filename: string;
};

function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

export function openMaxSharePicker(caption: string, hint?: string): void {
  const text = hint ? `${caption}\n\n${hint}` : caption;
  window.open(`${MAX_SHARE_BASE}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function canUseSystemFileShare(file: File): boolean {
  if (!isMobileDevice()) return false;
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
  if (typeof navigator.canShare !== "function") return true;
  return navigator.canShare({ files: [file] });
}

export async function deliverExportFile(
  blob: Blob,
  filename: string,
  caption: string,
  mode: ExportDeliveryMode,
): Promise<MaxDeliveryResult | void> {
  if (mode === "download") {
    downloadBlob(blob, filename);
    return;
  }

  const file = new File([blob], filename, {
    type: blob.type || "application/octet-stream",
    lastModified: Date.now(),
  });

  if (canUseSystemFileShare(file)) {
    await navigator.share({
      title: caption,
      text: caption,
      files: [file],
    });
    return { method: "system-share", filename };
  }

  downloadBlob(blob, filename);
  openMaxSharePicker(
    caption,
    `Файл «${filename}» в Загрузках — выберите чат в MAX и прикрепите скрепкой или перетащите файл в окно чата.`,
  );
  return { method: "max-picker", filename };
}

export function getMaxDeliveryToastMessage(result: MaxDeliveryResult): string {
  switch (result.method) {
    case "system-share":
      return "Выберите MAX в системном меню отправки";
    case "max-picker":
      return "Файл в Загрузках — в MAX выберите чат и прикрепите файл";
  }
}
