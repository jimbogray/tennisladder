import type { MatchScope, MatchStatusFilter } from "@tennisladder/shared";

const SCOPES: { value: MatchScope; label: string }[] = [
  { value: "mine", label: "Mine" },
  { value: "all", label: "All" },
];

const STATUSES: { value: MatchStatusFilter; label: string }[] = [
  { value: "completed", label: "Completed" },
  { value: "pending", label: "Pending" },
];

/**
 * Two independent filters. Scope always has one option selected; status is a toggle — clicking the
 * active one clears it, which is how you get back to every status.
 */
export function FilterToggleBar({
  scope,
  status,
  onScopeChange,
  onStatusChange,
}: {
  scope: MatchScope;
  status: MatchStatusFilter | null;
  onScopeChange: (next: MatchScope) => void;
  onStatusChange: (next: MatchStatusFilter | null) => void;
}) {
  return (
    <div className="filter-bar">
      <div className="filter-group" role="group" aria-label="Whose matches">
        {SCOPES.map((s) => (
          <button
            key={s.value}
            type="button"
            aria-pressed={scope === s.value}
            onClick={() => onScopeChange(s.value)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="filter-group" role="group" aria-label="Match status">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            type="button"
            aria-pressed={status === s.value}
            onClick={() => onStatusChange(status === s.value ? null : s.value)}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
