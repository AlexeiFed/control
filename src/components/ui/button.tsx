import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import type { LinkProps } from "next/link";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "menu" | "icon";
type ButtonSize = "sm" | "md" | "lg" | "icon";

const baseClasses =
  "inline-flex items-center justify-center gap-2 rounded-button text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-app-bg disabled:pointer-events-none disabled:opacity-55";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "border border-accent-primary bg-accent-primary text-white shadow-sm hover:bg-accent-primary-hover",
  secondary: "border border-app-border bg-app-elevated text-app-text hover:border-accent-primary hover:bg-white",
  outline: "border border-app-border bg-app-surface text-app-text hover:border-accent-primary hover:bg-app-elevated",
  ghost: "border border-transparent bg-transparent text-app-text hover:bg-app-elevated",
  danger: "border border-accent-danger/60 bg-accent-danger/10 text-accent-danger hover:bg-accent-danger/20",
  menu: "w-full border border-transparent bg-transparent text-left font-medium text-app-text hover:bg-app-elevated",
  icon: "border border-transparent bg-transparent text-app-text hover:bg-app-elevated",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-xs",
  md: "h-10 px-4",
  lg: "h-12 px-5",
  icon: "size-9 p-0",
};

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function buttonVariants({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return cn(baseClasses, variantClasses[variant], sizeClasses[size], className);
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({ variant, size, className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonVariants({ variant, size, className })} {...props} />;
}

type ButtonLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> &
  LinkProps & {
    children: ReactNode;
    variant?: ButtonVariant;
    size?: ButtonSize;
  };

export function ButtonLink({ variant, size, className, children, ...props }: ButtonLinkProps) {
  return (
    <Link className={buttonVariants({ variant, size, className })} {...props}>
      {children}
    </Link>
  );
}
