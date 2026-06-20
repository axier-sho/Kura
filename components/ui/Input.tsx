import type { InputHTMLAttributes } from "react";
import { cx } from "./cx";

/**
 * Wraps the `.input` class and adds a consistent disabled look. Caller
 * `className` is appended last so size/width overrides still apply.
 */
export function Input({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        "input disabled:bg-gray-50 disabled:text-gray-400",
        className,
      )}
      {...rest}
    />
  );
}
