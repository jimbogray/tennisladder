import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchMyMatches } from "../api/matches.js";

export function NegotiationsPage() {
  const { data, isLoading } = useQuery({ queryKey: ["matches", "mine"], queryFn: fetchMyMatches });

  return (
    <div>
      <h1>My Negotiations</h1>
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
