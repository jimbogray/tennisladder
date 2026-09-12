import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { MatchFilter, PublicUserDto } from "@tennisladder/shared";
import { fetchMatches } from "../api/matches.js";
import { FilterToggleBar } from "../components/FilterToggleBar.js";
import { MatchStatusBadge } from "../components/MatchStatusBadge.js";
import { useAuth } from "../hooks/useAuth.js";

function PlayerName({ player, isCurrentUser }: { player: PublicUserDto; isCurrentUser: boolean }) {
  return (
    <>
      {player.firstName} {player.lastName}
      {isCurrentUser ? <span className="you-badge">you</span> : null}
    </>
  );
}

export function MatchesPage() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<MatchFilter>("all");
  const { data, isLoading } = useQuery({
    queryKey: ["matches", filter],
    queryFn: () => fetchMatches(filter),
  });

  return (
    <div>
      <h1>Matches</h1>
      <FilterToggleBar value={filter} onChange={setFilter} />
      <p>
        <Link to="/matches/new">Propose a challenge</Link>
      </p>
      {isLoading || !data ? (
        <p>Loading…</p>
      ) : data.length === 0 ? (
        <p>No matches yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Challenger</th>
              <th>USTA</th>
              <th>Opponent</th>
              <th>USTA</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.map((match) => {
              const challengerIsMe = match.challenger.id === user?.id;
              const opponentIsMe = match.opponent.id === user?.id;
              return (
                <tr
                  key={match.id}
                  className={challengerIsMe || opponentIsMe ? "row-me" : undefined}
                >
                  <td>
                    <PlayerName player={match.challenger} isCurrentUser={challengerIsMe} />
                  </td>
                  <td>{match.challenger.ustaRating ?? "—"}</td>
                  <td>
                    <PlayerName player={match.opponent} isCurrentUser={opponentIsMe} />
                  </td>
                  <td>{match.opponent.ustaRating ?? "—"}</td>
                  <td>
                    <MatchStatusBadge status={match.status} />
                  </td>
                  <td>
                    <Link to={`/matches/${match.id}`}>View</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
