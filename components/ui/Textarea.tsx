import type { TextareaHTMLAttributes } from "react";
import { cx } from "./cx";

/**
 * Wraps the `.input` class on a `<textarea>`. Caller `className` is appended
 * last so add-ons like `font-mono text-xs` still apply.
 */
export function Textarea({
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cx(
        "input disabled:bg-gray-50 disabled:text-gray-400",
        className,
      )}
      {...rest}
    />
  );
}
