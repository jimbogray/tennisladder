import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PublicUserDto, ResultOutcome } from "@tennisladder/shared";
import {
  acceptMatch,
  adminCancelMatch,
  amendProposal,
  cancelMatch,
  counterPropose,
  amendResult,
  confirmResult,
  declineMatch,
  fetchMatch,
  proposeResult,
  rejectResult,
  withdrawMatch,
} from "../api/matches.js";
import { fetchLocations } from "../api/locations.js";
import { fetchMyAddresses, setTravelOrigin as saveTravelOrigin } from "../api/addresses.js";
import { ApiError } from "../api/client.js";
import { formatMatchDateTime } from "../lib/dateTime.js";
import { MatchStatusBadge } from "../components/MatchStatusBadge.js";
import { ProposalForm } from "../components/ProposalForm.js";
import { TravelPlan } from "../components/TravelPlan.js";
import {
  defaultTravelOriginId,
  toTravelOriginAddressId,
  TravelOriginPicker,
} from "../components/TravelOriginPicker.js";
import { useAuth } from "../hooks/useAuth.js";

function PlayerLine({ player, isCurrentUser }: { player: PublicUserDto; isCurrentUser: boolean }) {
  return (
    <>
      {player.firstName} {player.lastName}
      {isCurrentUser ? <span className="you-badge">you</span> : null}
    </>
  );
}

type Mode =
  | "none"
  | "amend"
  | "counter"
  | "cancel"
  | "admin-cancel"
  | "withdraw"
  | "report-result"
  | "amend-result"
  | "reject-result"
  | "travel-origin";

// Cancelling, withdrawing and rejecting a score all share a confirm-with-optional-reason step;
// only the wording and the endpoint differ.
const REASON_FORMS = {
  cancel: {
    prompt: "Why are you cancelling? (optional)",
    confirm: "Cancel match",
    submit: cancelMatch,
  },
  withdraw: {
    prompt: "Why are you withdrawing? (optional)",
    confirm: "Withdraw proposal",
    submit: withdrawMatch,
  },
  "admin-cancel": {
    prompt: "Why are you calling this match off? (optional — both players will see it)",
    confirm: "Cancel this match",
    submit: adminCancelMatch,
  },
  "reject-result": {
    prompt: "Why is this score wrong? (optional)",
    confirm: "Reject score",
    submit: rejectResult,
  },
} as const;

// Reported from the reporter's own point of view; the server resolves it to winner/loser.
const OUTCOME_CHOICES = [
  { outcome: "WON", label: "I won" },
  { outcome: "LOST", label: "I lost" },
  { outcome: "TIED", label: "Tied" },
] as const satisfies readonly { outcome: ResultOutcome; label: string }[];

type ReasonMode = keyof typeof REASON_FORMS;

function isReasonMode(mode: Mode): mode is ReasonMode {
  return mode in REASON_FORMS;
}

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
  const { data: addresses } = useQuery({ queryKey: ["addresses"], queryFn: fetchMyAddresses });
  const [mode, setMode] = useState<Mode>("none");
  // null until the player picks, so the default follows the match's saved choice once loaded.
  const [travelOrigin, setTravelOrigin] = useState<string | null>(null);
  const [endComment, setEndComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (isLoading || !data) return <p>Loading…</p>;

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      setMode("none");
      setEndComment("");
      setTravelOrigin(null);
      await queryClient.invalidateQueries({ queryKey: ["match", id] });
      await queryClient.invalidateQueries({ queryKey: ["matches"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That didn't work. Please try again.");
    }
  }

  async function handleReasonSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isReasonMode(mode)) return;
    const submit = REASON_FORMS[mode].submit;
    await run(() => submit(data!.id, endComment.trim() || undefined));
  }

  // Anyone can open any match, but only the two players can act on one.
  const isParticipant = data.challenger.id === user?.id || data.opponent.id === user?.id;
  // The player who owes a reply accepts/counters/declines; the other side can only amend the
  // offer it already made.
  const isMyTurn = data.awaitingResponseFromUserId === user?.id;
  const otherPlayer = data.challenger.id === user?.id ? data.opponent : data.challenger;
  const negotiating = data.status === "NEGOTIATING";

  const playerById = (id: string | null) =>
    id === data.challenger.id ? data.challenger : id === data.opponent.id ? data.opponent : null;
  const winner = playerById(data.winnerId);
  const loser = playerById(data.loserId);
  // A score is awaiting an answer; whoever didn't report it owes the reply.
  const scorePending = data.status === "RESULT_PENDING";
  const iReportedScore = scorePending && !isMyTurn;

  const upcoming = negotiating || data.status === "SCHEDULED";
  // An admin can call off a match they're not in. An admin who *is* a player in it uses the normal
  // participant controls above, so a match never shows two competing cancel buttons.
  const canAdminCancel = user?.role === "ADMIN" && !isParticipant && upcoming;
  const travelOriginId = travelOrigin ?? defaultTravelOriginId(addresses, data.myTravelOrigin);
  // Undefined while addresses are loading leaves the saved choice untouched.
  const travelOriginAddressId = addresses ? toTravelOriginAddressId(travelOriginId) : undefined;
  const travelOriginPicker = (
    <div className="travel-origin-field">
      <TravelOriginPicker
        id="match-travel-origin"
        addresses={addresses}
        value={travelOriginId}
        onChange={setTravelOrigin}
      />
    </div>
  );

  return (
    <div>
      <h1>
        Match <MatchStatusBadge status={data.status} note={data.cancellationComment} />
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
        <dd>{formatMatchDateTime(data.scheduledDateTime ?? data.proposedDateTime)}</dd>

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

        {/* Private: the API only ever returns the requesting player's own choice. While
            negotiating, every action form has its own picker, so an unset choice isn't repeated. */}
        {isParticipant && (data.myTravelOrigin || data.status === "SCHEDULED") ? (
          <>
            <dt>Coming from</dt>
            <dd>
              {data.myTravelOrigin ? data.myTravelOrigin.label : "Not specified"}
              <span className="match-detail-address">Only you can see this</span>
            </dd>
          </>
        ) : null}

        {data.isTie || (winner && loser) ? (
          <>
            <dt>{data.status === "COMPLETED" ? "Result" : "Reported score"}</dt>
            <dd>
              {data.isTie ? (
                <>
                  {data.challenger.firstName} and {data.opponent.firstName} tied
                </>
              ) : (
                <>
                  {winner!.firstName} {winner!.lastName} beat {loser!.firstName} {loser!.lastName}
                </>
              )}
              {data.status === "COMPLETED" ? (
                <span className="match-detail-address">
                  {data.isTie
                    ? "No ladder points awarded for a tie"
                    : `${data.pointsAwarded} ladder ${data.pointsAwarded === 1 ? "point" : "points"} awarded`}
                </span>
              ) : null}
            </dd>
          </>
        ) : null}
      </dl>

      {/* Only for a match that's actually arranged, and only for its players: the departure time
          gives away where someone lives. */}
      {isParticipant && data.status === "SCHEDULED" && data.scheduledDateTime ? (
        <TravelPlan matchId={data.id} scheduledDateTime={data.scheduledDateTime} />
      ) : null}

      {error ? <p role="alert">{error}</p> : null}

      {isParticipant && negotiating && mode === "none" ? (
        isMyTurn ? (
          <>
            <p>
              {otherPlayer.firstName} proposed this — accept it, suggest a change, or decline.
            </p>
            {travelOriginPicker}
            <div className="form-actions">
              <button
                type="button"
                onClick={() => run(() => acceptMatch(data.id, { travelOriginAddressId }))}
              >
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
              {data.challenger.id === user?.id ? (
                <button type="button" className="button-danger" onClick={() => setMode("withdraw")}>
                  Withdraw proposal
                </button>
              ) : null}
            </div>
          </>
        )
      ) : null}

      {isParticipant && negotiating && (mode === "amend" || mode === "counter") ? (
        <ProposalForm
          locations={locations ?? []}
          addresses={addresses}
          initialDateTime={data.proposedDateTime}
          initialLocationId={data.proposedLocationId}
          initialTravelOrigin={data.myTravelOrigin}
          submitLabel={mode === "amend" ? "Update proposal" : "Send back"}
          onCancel={() => setMode("none")}
          onSubmit={(input) =>
            run(() =>
              mode === "amend" ? amendProposal(data.id, input) : counterPropose(data.id, input),
            )
          }
        />
      ) : null}

      {isReasonMode(mode) ? (
        <form onSubmit={handleReasonSubmit}>
          <label htmlFor="end-comment">{REASON_FORMS[mode].prompt}</label>
          <textarea
            id="end-comment"
            value={endComment}
            onChange={(e) => setEndComment(e.target.value)}
          />
          <div className="form-actions">
            <button type="submit" className="button-danger">
              {REASON_FORMS[mode].confirm}
            </button>
            <button type="button" className="button-secondary" onClick={() => setMode("none")}>
              Back
            </button>
          </div>
        </form>
      ) : null}

      {/* Reporting a score, and correcting one you already reported, ask the same question. */}
      {isParticipant && (mode === "report-result" || mode === "amend-result") ? (
        <>
          <p>How did it go against {otherPlayer.firstName}?</p>
          <div className="form-actions">
            {OUTCOME_CHOICES.map(({ outcome, label }) => (
              <button
                key={outcome}
                type="button"
                onClick={() =>
                  run(() =>
                    mode === "report-result"
                      ? proposeResult(data.id, { outcome })
                      : amendResult(data.id, { outcome }),
                  )
                }
              >
                {label}
              </button>
            ))}
            <button type="button" className="button-secondary" onClick={() => setMode("none")}>
              Back
            </button>
          </div>
        </>
      ) : null}

      {isParticipant && data.status === "SCHEDULED" && mode === "none" ? (
        <div className="form-actions">
          <button type="button" onClick={() => setMode("report-result")}>
            Record result
          </button>
          {addresses?.length ? (
            <button type="button" className="button-secondary" onClick={() => setMode("travel-origin")}>
              Change where you're coming from
            </button>
          ) : null}
          <button type="button" className="button-danger" onClick={() => setMode("cancel")}>
            Cancel match
          </button>
        </div>
      ) : null}

      {/* Admin clearing out a stalled negotiation, or an arranged match that can't go ahead. The
          match stays in both players' history as CANCELLED, with the reason on the status badge. */}
      {canAdminCancel && mode === "none" ? (
        <div className="form-actions">
          <button type="button" className="button-danger" onClick={() => setMode("admin-cancel")}>
            Cancel this match
          </button>
        </div>
      ) : null}

      {isParticipant && upcoming && mode === "travel-origin" ? (
        <>
          {travelOriginPicker}
          <div className="form-actions">
            <button
              type="button"
              onClick={() =>
                run(() =>
                  saveTravelOrigin(data.id, { addressId: toTravelOriginAddressId(travelOriginId) }),
                )
              }
            >
              Save
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => {
                setMode("none");
                setTravelOrigin(null);
              }}
            >
              Back
            </button>
          </div>
        </>
      ) : null}

      {isParticipant && scorePending && mode === "none" ? (
        iReportedScore ? (
          <>
            <p>Waiting for {otherPlayer.firstName} to confirm this score.</p>
            <div className="form-actions">
              <button type="button" onClick={() => setMode("amend-result")}>
                Amend result
              </button>
            </div>
          </>
        ) : (
          <>
            <p>{otherPlayer.firstName} reported this score — confirm it, or reject it if it's wrong.</p>
            <div className="form-actions">
              <button type="button" onClick={() => run(() => confirmResult(data.id))}>
                Confirm score
              </button>
              <button type="button" className="button-danger" onClick={() => setMode("reject-result")}>
                Reject score
              </button>
            </div>
          </>
        )
      ) : null}

      {data.status === "RESULT_DISPUTED" ? (
        <p>This score is disputed. An admin will review it and set the final result.</p>
      ) : null}
    </div>
  );
}
