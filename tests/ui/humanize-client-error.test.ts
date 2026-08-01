import { describe, expect, it } from "vitest";
import { humanizeClientError } from "../../src/lib/ui/humanize-client-error";

describe("humanizeClientError", () => {
  it("переводит типичный сбой Next server action на русский", () => {
    expect(humanizeClientError(new Error("Unexpected end of JSON input"))).toBe(
      "Сервер вернул пустой ответ. Повторите действие — если снова ошибка, обновите страницу.",
    );
    expect(humanizeClientError(new Error("An unexpected response was received from the server."))).toBe(
      "Сервер вернул неожиданный ответ. Повторите действие или обновите страницу.",
    );
  });

  it("оставляет понятные русские сообщения как есть", () => {
    expect(humanizeClientError(new Error("Нельзя назначить: пересечение смен"))).toBe(
      "Нельзя назначить: пересечение смен",
    );
  });

  it("даёт fallback для пустого/неизвестного", () => {
    expect(humanizeClientError(null)).toBe("Не удалось выполнить действие");
    expect(humanizeClientError({})).toBe("Не удалось выполнить действие");
  });
});
