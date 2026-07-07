import { useQuery } from "@tanstack/react-query";
import { fetchLadder } from "../api/players.js";

export function AdminPlayersPage() {
  const { data, isLoading } = useQuery({ queryKey: ["ladder"], queryFn: fetchLadder });

  return (
    <div>
      <h1>Manage Player Points</h1>
      {isLoading || !data ? (
        <p>Loading…</p>
      ) : (
        <ul>
          {data.map((p) => (
            <li key={p.userId}>
              {p.firstName} {p.lastName} — {p.points} pts
              {/* TODO: inline point-override form calling PATCH /api/admin/players/:id/points */}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
