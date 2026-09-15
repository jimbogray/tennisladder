import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { MatchDto, MatchScope, MatchStatusFilter, PublicUserDto } from "@tennisladder/shared";
import { fetchMatches } from "../api/matches.js";
import { FilterToggleBar } from "../components/FilterToggleBar.js";
import { MatchStatusBadge } from "../components/MatchStatusBadge.js";
import { useAuth } from "../hooks/useAuth.js";

type PlayerOutcome = "won" | "tied" | null;

/**
 * Only a finished match has an outcome — a proposed score isn't one yet. The loser gets no badge:
 * highlighting just the winner keeps the row readable at a glance.
 */
function outcomeFor(match: MatchDto, playerId: string): PlayerOutcome {
  if (match.status !== "COMPLETED") return null;
  if (match.isTie) return "tied";
  if (match.winnerId === playerId) return "won";
  return null;
}

function PlayerName({
  player,
  isCurrentUser,
  outcome,
}: {
  player: PublicUserDto;
  isCurrentUser: boolean;
  outcome: PlayerOutcome;
}) {
  return (
    <>
      {player.firstName} {player.lastName}
      {isCurrentUser ? <span className="you-badge">you</span> : null}
      {outcome ? <span className={`result-badge result-${outcome}`}>{outcome}</span> : null}
    </>
  );
}

export function MatchesPage() {
  const { user } = useAuth();
  // Defaults to the signed-in player's own matches — the club's full list is rarely what you want.
  const [scope, setScope] = useState<MatchScope>("mine");
  const [status, setStatus] = useState<MatchStatusFilter | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["matches", scope, status],
    queryFn: () => fetchMatches(scope, status),
  });

  return (
    <div>
      <h1>Matches</h1>
      <FilterToggleBar
        scope={scope}
        status={status}
        onScopeChange={setScope}
        onStatusChange={setStatus}
      />
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
                    <PlayerName
                      player={match.challenger}
                      isCurrentUser={challengerIsMe}
                      outcome={outcomeFor(match, match.challenger.id)}
                    />
                  </td>
                  <td>{match.challenger.ustaRating ?? "—"}</td>
                  <td>
                    <PlayerName
                      player={match.opponent}
                      isCurrentUser={opponentIsMe}
                      outcome={outcomeFor(match, match.opponent.id)}
                    />
                  </td>
                  <td>{match.opponent.ustaRating ?? "—"}</td>
                  <td>
                    <MatchStatusBadge status={match.status} note={match.cancellationComment} />
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
