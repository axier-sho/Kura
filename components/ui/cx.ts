/**
 * Minimal className joiner — drops falsy values and joins with a space.
 * Keeps the `ui/` wrappers dependency-free (no clsx). Caller-supplied classes
 * are passed last by every wrapper so width/size/color overrides win.
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
