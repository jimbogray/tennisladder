import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PublicUserDto } from "@tennisladder/shared";
import {
  acceptMatch,
  amendProposal,
  cancelMatch,
  counterPropose,
  declineMatch,
  fetchMatch,
} from "../api/matches.js";
import { fetchLocations } from "../api/locations.js";
import { ApiError } from "../api/client.js";
import { MatchStatusBadge } from "../components/MatchStatusBadge.js";
import { ProposalForm } from "../components/ProposalForm.js";
import { useAuth } from "../hooks/useAuth.js";

function PlayerLine({ player, isCurrentUser }: { player: PublicUserDto; isCurrentUser: boolean }) {
  return (
    <>
      {player.firstName} {player.lastName}
      {isCurrentUser ? <span className="you-badge">you</span> : null}
    </>
  );
}

type Mode = "none" | "amend" | "counter" | "cancel";

export function MatchDetailPage() {
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["match", id],
    queryFn: () => fetchMatch(id!),
    enabled: !!id,
  });
  const { data: locations } = useQuery({ queryKey: ["locations"], queryFn: fetchLocations });
  const [mode, setMode] = useState<Mode>("none");
  const [cancelComment, setCancelComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (isLoading || !data) return <p>Loading…</p>;

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      setMode("none");
      setCancelComment("");
      await queryClient.invalidateQueries({ queryKey: ["match", id] });
      await queryClient.invalidateQueries({ queryKey: ["matches"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That didn't work. Please try again.");
    }
  }

  async function handleCancel(e: FormEvent) {
    e.preventDefault();
    await run(() => cancelMatch(data!.id, cancelComment.trim() || undefined));
  }

  // Anyone can open any match, but only the two players can act on one.
  const isParticipant = data.challenger.id === user?.id || data.opponent.id === user?.id;
  // The player who owes a reply accepts/counters/declines; the other side can only amend the
  // offer it already made.
  const isMyTurn = data.awaitingResponseFromUserId === user?.id;
  const otherPlayer = data.challenger.id === user?.id ? data.opponent : data.challenger;
  const negotiating = data.status === "NEGOTIATING";

  return (
    <div>
      <h1>
        Match <MatchStatusBadge status={data.status} />
      </h1>

      <dl className="match-detail">
        <dt>Challenger</dt>
        <dd>
          <PlayerLine player={data.challenger} isCurrentUser={data.challenger.id === user?.id} />
        </dd>

        <dt>Rating</dt>
        <dd>{data.challenger.ustaRating ?? "—"}</dd>

        <dt>Opponent</dt>
        <dd>
          <PlayerLine player={data.opponent} isCurrentUser={data.opponent.id === user?.id} />
        </dd>

        <dt>Rating</dt>
        <dd>{data.opponent.ustaRating ?? "—"}</dd>

        <dt>{data.scheduledDateTime ? "Scheduled" : "Proposed"}</dt>
        <dd>{new Date(data.scheduledDateTime ?? data.proposedDateTime).toLocaleString()}</dd>

        <dt>Location</dt>
        <dd>
          {data.proposedLocation.name}
          {data.proposedLocation.address ? (
            <span className="match-detail-address">{data.proposedLocation.address}</span>
          ) : null}
        </dd>

        {data.proposedComment ? (
          <>
            <dt>Comment</dt>
            <dd>{data.proposedComment}</dd>
          </>
        ) : null}
      </dl>

      {error ? <p role="alert">{error}</p> : null}

      {isParticipant && negotiating && mode === "none" ? (
        isMyTurn ? (
          <>
            <p>
              {otherPlayer.firstName} proposed this — accept it, suggest a change, or decline.
            </p>
            <div className="form-actions">
              <button type="button" onClick={() => run(() => acceptMatch(data.id))}>
                Accept
              </button>
              <button type="button" onClick={() => setMode("counter")}>
                Suggest a change
              </button>
              <button type="button" className="button-danger" onClick={() => run(() => declineMatch(data.id))}>
                Decline
              </button>
            </div>
          </>
        ) : (
          <>
            <p>Waiting for {otherPlayer.firstName} to respond. You can still change your proposal.</p>
            <div className="form-actions">
              <button type="button" onClick={() => setMode("amend")}>
                Amend proposal
              </button>
            </div>
          </>
        )
      ) : null}

      {isParticipant && negotiating && (mode === "amend" || mode === "counter") ? (
        <ProposalForm
          locations={locations ?? []}
          initialDateTime={data.proposedDateTime}
          initialLocationId={data.proposedLocationId}
          submitLabel={mode === "amend" ? "Update proposal" : "Send back"}
          onCancel={() => setMode("none")}
          onSubmit={(input) =>
            run(() =>
              mode === "amend" ? amendProposal(data.id, input) : counterPropose(data.id, input),
            )
          }
        />
      ) : null}

      {isParticipant && data.status === "SCHEDULED" ? (
        mode === "cancel" ? (
          <form onSubmit={handleCancel}>
            <label htmlFor="cancel-comment">Why are you cancelling? (optional)</label>
            <textarea
              id="cancel-comment"
              value={cancelComment}
              onChange={(e) => setCancelComment(e.target.value)}
            />
            <div className="form-actions">
              <button type="submit" className="button-danger">
                Cancel match
              </button>
              <button type="button" className="button-secondary" onClick={() => setMode("none")}>
                Back
              </button>
            </div>
          </form>
        ) : (
          <div className="form-actions">
            <button type="button" className="button-danger" onClick={() => setMode("cancel")}>
              Cancel match
            </button>
          </div>
        )
      ) : null}
    </div>
  );
}
