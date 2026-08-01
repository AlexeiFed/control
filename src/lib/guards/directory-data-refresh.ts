export const DIRECTORY_DATA_REFRESH_EVENT = "control:directory-data-refresh";
export const DIRECTORY_DATA_REFRESH_STORAGE_KEY = "control:directory-data-refresh-at";

/** Сигнал клиенту: обновить RSC-данные (статусы охранников, график, объекты). */
export function dispatchDirectoryDataRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DIRECTORY_DATA_REFRESH_EVENT));
  try {
    localStorage.setItem(DIRECTORY_DATA_REFRESH_STORAGE_KEY, String(Date.now()));
  } catch {
    /* private mode / denied */
  }
}
