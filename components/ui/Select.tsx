import type { SelectHTMLAttributes } from "react";
import { cx } from "./cx";

/**
 * Wraps the `.input` class on a `<select>`. Pass `<option>`s as children, the
 * same shape as the existing call sites.
 */
export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx(
        "input disabled:bg-gray-50 disabled:text-gray-400",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}
