import { Link } from "react-router-dom";
import type { LadderEntryDto } from "@tennisladder/shared";
import { useAuth } from "../hooks/useAuth.js";
import { Avatar } from "./Avatar.js";

export function LadderTable({ entries }: { entries: LadderEntryDto[] }) {
  const { user } = useAuth();
  // Coach-admins don't play, and the server rejects challenges from them, so don't offer the action.
  const canChallenge = user?.participatesInLadder === true;

  return (
    <table>
      <thead>
        <tr>
          <th>Player</th>
          <th>USTA</th>
          <th>Points</th>
          <th>Record</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => {
          const isCurrentUser = entry.userId === user?.id;
          const name = `${entry.firstName} ${entry.lastName}`;
          return (
            <tr key={entry.userId} className={isCurrentUser ? "row-me" : undefined}>
              <td>
                <span className="ladder-player">
                  <Avatar
                    firstName={entry.firstName}
                    lastName={entry.lastName}
                    avatarId={entry.avatarId}
                    size="sm"
                  />
                  {name}
                  {isCurrentUser ? <span className="you-badge">you</span> : null}
                </span>
              </td>
              <td>{entry.ustaRating ?? "—"}</td>
              <td>{entry.points}</td>
              <td>
                {entry.wins}-{entry.losses}-{entry.ties}
              </td>
              <td>
                {canChallenge && !isCurrentUser ? (
                  <Link
                    className="challenge-link"
                    to={`/matches/new?opponentId=${encodeURIComponent(entry.userId)}`}
                    title={`Challenge ${name}`}
                    aria-label={`Challenge ${name}`}
                  >
                    <span aria-hidden="true">🎾</span>
                  </Link>
                ) : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
