import type { MatchStatus } from "@tennisladder/shared";

export function MatchStatusBadge({ status }: { status: MatchStatus }) {
  return <span data-status={status}>{status.replace(/_/g, " ")}</span>;
}
