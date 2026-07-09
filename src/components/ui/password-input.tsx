"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type InputHTMLAttributes } from "react";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label?: string;
  labelClassName?: string;
  wrapperClassName?: string;
};

export function PasswordInput({
  label,
  labelClassName,
  wrapperClassName,
  className = "",
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  const input = (
    <div className={`relative ${wrapperClassName ?? ""}`}>
      <input
        {...props}
        type={visible ? "text" : "password"}
        className={`w-full rounded-button border border-app-border bg-app-elevated py-2 pl-3 pr-10 text-app-text outline-none transition placeholder:text-app-muted focus:border-accent-primary focus:ring-4 focus:ring-accent-primary/15 ${className}`}
      />
      <button
        type="button"
        tabIndex={-1}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-button p-1.5 text-app-muted hover:bg-app-bg hover:text-app-text"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );

  if (!label) return input;

  return (
    <label className={labelClassName ?? "grid gap-1 text-sm"}>
      <span className="text-app-muted">{label}</span>
      {input}
    </label>
  );
}
