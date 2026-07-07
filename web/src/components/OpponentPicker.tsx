import type { PublicUserDto } from "@tennisladder/shared";

// Sourced from GET /api/players/challengeable, which already excludes coach-admins
// (participatesInLadder=false) server-side.
export function OpponentPicker({
  players,
  value,
  onChange,
}: {
  players: PublicUserDto[];
  value: string;
  onChange: (userId: string) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="" disabled>
        Select an opponent
      </option>
      {players.map((p) => (
        <option key={p.id} value={p.id}>
          {p.firstName} {p.lastName}
        </option>
      ))}
    </select>
  );
}
