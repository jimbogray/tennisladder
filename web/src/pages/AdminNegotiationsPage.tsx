import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchAdminPendingMatches } from "../api/matches.js";

export function AdminNegotiationsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "matches", "pending"],
    queryFn: fetchAdminPendingMatches,
  });

  return (
    <div>
      <h1>Club-wide Pending Negotiations</h1>
      {isLoading || !data ? (
        <p>Loading…</p>
      ) : (
        <ul>
          {data.map((match) => (
            <li key={match.id}>
              <Link to={`/matches/${match.id}`}>{match.id}</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
