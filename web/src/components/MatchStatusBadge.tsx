import type { MatchStatus } from "@tennisladder/shared";

/**
 * `note` is surfaced as a tooltip — used for a cancellation reason. It gets a dotted underline so
 * there's some hint that hovering shows more, and is repeated in aria-label for screen readers
 * since title alone is unreliable there.
 */
export function MatchStatusBadge({ status, note }: { status: MatchStatus; note?: string | null }) {
  const label = status.replace(/_/g, " ");

  if (!note) return <span data-status={status}>{label}</span>;

  return (
    <span data-status={status} className="status-with-note" title={note} aria-label={`${label}: ${note}`}>
      {label}
    </span>
  );
}
