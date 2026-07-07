import type { MatchFilter } from "@tennisladder/shared";

const FILTERS: { value: MatchFilter; label: string }[] = [
  { value: "all", label: "Show All" },
  { value: "completed", label: "Only Completed" },
  { value: "pending", label: "Only Pending" },
];

export function FilterToggleBar({
  value,
  onChange,
}: {
  value: MatchFilter;
  onChange: (next: MatchFilter) => void;
}) {
  return (
    <div role="tablist" aria-label="Match filter">
      {FILTERS.map((f) => (
        <button
          key={f.value}
          type="button"
          aria-pressed={value === f.value}
          onClick={() => onChange(f.value)}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}
