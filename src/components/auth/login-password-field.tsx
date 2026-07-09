"use client";

import { PasswordInput } from "../ui/password-input";

export function LoginPasswordField() {
  return (
    <PasswordInput
      label="Пароль"
      labelClassName="mt-6 block text-sm font-medium"
      name="password"
      required
      autoComplete="current-password"
      placeholder="Введите пароль"
      wrapperClassName="mt-2"
      className="px-4 py-3"
    />
  );
}
