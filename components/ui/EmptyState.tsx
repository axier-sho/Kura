import type { ReactNode } from "react";

/**
 * Friendly empty placeholder: a centered card with an optional icon, a title,
 * a muted description, and an optional call-to-action (usually a Link/Button).
 * Replaces the bare `<div className="card text-sm text-gray-500">…</div>`
 * empties scattered across pages.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center justify-center gap-2 py-10 text-center">
      {icon ? (
        <div className="text-3xl text-gray-300" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-medium text-gray-700">{title}</p>
      {description ? (
        <p className="max-w-sm text-xs text-gray-500">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
