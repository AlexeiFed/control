/**
 * Технические англ. ошибки Next/JSON → понятный русский для toast.
 * Бизнес-сообщения (уже по-русски) оставляем как есть.
 */
export function humanizeClientError(
  err: unknown,
  fallback = "Не удалось выполнить действие",
): string {
  const raw = err instanceof Error ? err.message.trim() : typeof err === "string" ? err.trim() : "";
  if (!raw) return fallback;

  const lower = raw.toLowerCase();
  if (lower.includes("unexpected end of json") || lower === "unexpected end of json input") {
    return "Сервер вернул пустой ответ. Повторите действие — если снова ошибка, обновите страницу.";
  }
  if (lower.includes("unexpected response was received from the server")) {
    return "Сервер вернул неожиданный ответ. Повторите действие или обновите страницу.";
  }
  if (lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("load failed")) {
    return "Нет связи с сервером. Проверьте интернет и повторите.";
  }
  if (lower.includes("shift end must be after shift start")) {
    return "Окончание смены должно быть позже начала";
  }

  // Не светим сырой англ. stack / flight-digest пользователю
  if (/^[A-Za-z][A-Za-z0-9 _:[\]()'".+-]*$/.test(raw) && /[A-Za-z]{4,}/.test(raw)) {
    const hasCyrillic = /[А-Яа-яЁё]/.test(raw);
    if (!hasCyrillic) return fallback;
  }

  return raw;
}
