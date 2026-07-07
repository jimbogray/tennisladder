import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { MatchFilter } from "@tennisladder/shared";
import { fetchMatches } from "../api/matches.js";
import { FilterToggleBar } from "../components/FilterToggleBar.js";
import { MatchStatusBadge } from "../components/MatchStatusBadge.js";

export function MatchesPage() {
  const [filter, setFilter] = useState<MatchFilter>("all");
  const { data, isLoading } = useQuery({
    queryKey: ["matches", filter],
    queryFn: () => fetchMatches(filter),
  });

  return (
    <div>
      <h1>Scheduled Matches</h1>
      <FilterToggleBar value={filter} onChange={setFilter} />
      <Link to="/matches/new">Propose a challenge</Link>
      {isLoading || !data ? (
        <p>Loading…</p>
      ) : (
        <ul>
          {data.map((match) => (
            <li key={match.id}>
              {/* TODO: display Challenger Name / Opponent Name once MatchDto is joined with player names */}
              <Link to={`/matches/${match.id}`}>
                {match.challengerId} vs {match.opponentId}
              </Link>{" "}
              <MatchStatusBadge status={match.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
