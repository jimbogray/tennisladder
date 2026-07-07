import type { LadderEntryDto } from "@tennisladder/shared";

export function LadderTable({ entries }: { entries: LadderEntryDto[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Player</th>
          <th>Points</th>
          <th>Record</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.userId}>
            <td>
              {entry.firstName} {entry.lastName}
            </td>
            <td>{entry.points}</td>
            <td>
              {entry.wins}-{entry.losses}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
