import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

type Variant = "primary" | "ghost" | "danger";

const VARIANT_CLASS: Record<Variant, string> = {
  primary: "btn-primary",
  ghost: "btn-ghost",
  danger: "btn-ghost text-kura-danger",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Shows a spinner and disables the button while keeping its label. */
  loading?: boolean;
}

/**
 * Thin wrapper over the `.btn-*` classes that adds consistent loading/disabled
 * feedback. Does NOT force a `type` default — many call sites are submit buttons
 * inside server-action forms, so the caller's `type` is forwarded as-is. Caller
 * `className` is appended last so `w-full`/`text-sm`/etc. still win.
 */
export function Button({
  variant = "primary",
  loading = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cx(VARIANT_CLASS[variant], className)}
      {...rest}
    >
      {loading && (
        <span
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );
}
