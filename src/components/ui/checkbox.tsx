"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "./button";

/**
 * Облегченная версия Checkbox на основе чистого React и Tailwind.
 * Использует стили из дизайн-системы проекта.
 */

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  onCheckedChange?: (checked: boolean) => void;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onCheckedChange?.(e.target.checked);
    };

    return (
      <div className="relative flex items-center justify-center">
        <input
          type="checkbox"
          className={cn(
            "peer size-4 shrink-0 appearance-none rounded-sm border border-app-border bg-app-bg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary disabled:cursor-not-allowed disabled:opacity-50 checked:border-accent-primary checked:bg-accent-primary",
            className
          )}
          checked={checked}
          onChange={handleChange}
          ref={ref}
          {...props}
        />
        <Check 
          className="pointer-events-none absolute size-3 text-white opacity-0 transition-opacity peer-checked:opacity-100" 
          strokeWidth={3}
        />
      </div>
    );
  }
);

Checkbox.displayName = "Checkbox";

export { Checkbox };
