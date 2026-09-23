import { Prisma, MatchEventType, MatchStatus, ResultOutcome } from "@prisma/client";
import { googleCalendarUrlForMatch } from "@tennisladder/shared";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { generateOpaqueToken, hashToken } from "./tokenService.js";
import { publishLadderChanged, publishMatchChanged } from "./liveUpdates.js";
import {
  notifyChallengeProposed,
  notifyMatchCalledOff,
  notifyMatchConfirmed,
  notifyProposalUpdated,
  notifyResultDisputed,
  notifyResultFinalized,
  notifyResultSubmitted,
  type IssuedResultToken,
} from "./matchNotifications.js";

/** Thrown for invalid match actions (bad turn, self-challenge, etc.). Callers surface as a 400. */
export class MatchValidationError extends Error {}

/**
 * Which of their own saved addresses a player is travelling from: an address id, `null` to clear
 * the choice, or `undefined` to leave it as it is.
 *
 * Deliberately not recorded as a MatchEvent: the event thread is shown to both players and
 * re-embedded in emails, and this choice is private to the player who made it.
 */
export type TravelOriginChoice = string | null | undefined;

async function assertOwnAddress(userId: string, addressId: TravelOriginChoice) {
  if (!addressId) return;
  // Scoped to the user so nobody can attach (or probe for) another player's address.
  const address = await prisma.userAddress.findFirst({ where: { id: addressId, userId } });
  if (!address) {
    throw new MatchValidationError("That address isn't one of your saved addresses");
  }
}

async function applyTravelOrigin(
  tx: Prisma.TransactionClient,
  matchId: string,
  userId: string,
  addressId: TravelOriginChoice,
) {
  if (addressId === undefined) return;
  if (addressId === null) {
    await tx.matchTravelOrigin.deleteMany({ where: { matchId, userId } });
    return;
  }
  await tx.matchTravelOrigin.upsert({
    where: { matchId_userId: { matchId, userId } },
    create: { matchId, userId, addressId },
    update: { addressId },
  });
}

/** The acting player's own travel origin for a match, with its address; null if none is set. */
export async function getTravelOrigin(matchId: string, userId: string) {
  const origin = await prisma.matchTravelOrigin.findUnique({
    where: { matchId_userId: { matchId, userId } },
    include: { address: true },
  });
  return origin?.address ?? null;
}

/** Changes where a player is coming from without otherwise touching the match. */
export async function setTravelOrigin(matchId: string, actingUserId: string, addressId: string | null) {
  const match = await loadForParticipant(matchId, actingUserId);

  // Only matches that are still to be played have a journey worth planning.
  if (match.status !== MatchStatus.NEGOTIATING && match.status !== MatchStatus.SCHEDULED) {
    throw new MatchValidationError("This match is no longer coming up");
  }
  await assertOwnAddress(actingUserId, addressId);

  await applyTravelOrigin(prisma, matchId, actingUserId, addressId);
  return getTravelOrigin(matchId, actingUserId);
}

/**
 * Runs a Match change and its MatchEvent in one transaction, then tells open pages about it and
 * emails whoever wasn't the one doing it. Every state change goes through here, so no transition
 * can be missed by either.
 *
 * Both happen after the commit, deliberately: a page that refetches straight away must read the
 * new state, and an email promising links a rolled-back transaction never stored would be worse
 * than sending nothing. `notify` is expected not to throw — see matchNotifications.ts, which
 * swallows and logs its own failures rather than turning a committed transition into an error.
 */
async function commitMatchChange<T extends { id: string }>(
  change: (tx: Prisma.TransactionClient) => Promise<T>,
  {
    ladderChanged = false,
    notify,
  }: { ladderChanged?: boolean; notify?: (match: T) => Promise<void> } = {},
): Promise<T> {
  const match = await prisma.$transaction(change);
  publishMatchChanged(match.id);
  if (ladderChanged) publishLadderChanged();
  if (notify) await notify(match);
  return match;
}

export interface ProposeMatchInput {
  challengerId: string;
  opponentId: string;
  proposedDateTime: Date;
  proposedLocationId: string;
  proposedComment?: string;
  travelOriginAddressId?: string | null;
}

export async function proposeMatch(input: ProposeMatchInput) {
  if (input.challengerId === input.opponentId) {
    throw new MatchValidationError("You can't challenge yourself");
  }
  await assertOwnAddress(input.challengerId, input.travelOriginAddressId);

  const [challenger, opponent] = await Promise.all([
    prisma.user.findUnique({ where: { id: input.challengerId }, select: { removedAt: true } }),
    prisma.user.findUnique({ where: { id: input.opponentId } }),
  ]);
  // A removed player's access token outlives their removal by a few minutes; don't let them use
  // that window to open a match nobody can finish.
  if (!challenger || challenger.removedAt) {
    throw new MatchValidationError("Your account is no longer on the team");
  }
  if (!opponent || opponent.removedAt) {
    throw new MatchValidationError("Opponent not found");
  }
  // Coach-admins are on the roster but never participate in the ladder, so they can't be
  // challenged. (The challenger's own participation is already enforced by requireLadderParticipant.)
  if (!opponent.participatesInLadder) {
    throw new MatchValidationError("That player can't be challenged");
  }

  const location = await prisma.location.findUnique({ where: { id: input.proposedLocationId } });
  if (!location) {
    throw new MatchValidationError("Location not found");
  }

  // The opponent must respond first, so the turn starts with them. Record the opening PROPOSED
  // event in the same transaction as the Match so a challenge always has its negotiation history.
  return commitMatchChange(async (tx) => {
    const match = await tx.match.create({
      data: {
        challengerId: input.challengerId,
        opponentId: input.opponentId,
        status: MatchStatus.NEGOTIATING,
        proposedDateTime: input.proposedDateTime,
        proposedLocationId: input.proposedLocationId,
        proposedComment: input.proposedComment,
        awaitingResponseFromUserId: input.opponentId,
      },
      include: { challenger: true, opponent: true, proposedLocation: true },
    });

    await tx.matchEvent.create({
      data: {
        matchId: match.id,
        type: MatchEventType.PROPOSED,
        actorUserId: input.challengerId,
        snapshotDateTime: input.proposedDateTime,
        snapshotLocationId: input.proposedLocationId,
        comment: input.proposedComment,
      },
    });

    await applyTravelOrigin(tx, match.id, input.challengerId, input.travelOriginAddressId);

    return match;
  }, { notify: (match) => notifyChallengeProposed(match.id) });
}

/** Loads a match and checks the acting user is one of its two players. */
async function loadForParticipant(matchId: string, actingUserId: string) {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) {
    throw new MatchValidationError("Match not found");
  }
  if (match.challengerId !== actingUserId && match.opponentId !== actingUserId) {
    throw new MatchValidationError("You're not a player in this match");
  }
  return match;
}

function otherPlayer(match: { challengerId: string; opponentId: string }, userId: string) {
  return match.challengerId === userId ? match.opponentId : match.challengerId;
}

export interface ProposalInput {
  proposedDateTime: Date;
  proposedLocationId: string;
  proposedComment?: string;
  travelOriginAddressId?: string | null;
}

async function assertLocationExists(locationId: string) {
  const location = await prisma.location.findUnique({ where: { id: locationId } });
  if (!location) {
    throw new MatchValidationError("Location not found");
  }
}

/**
 * Revises an offer that is still awaiting the *other* player's response — i.e. the side that made
 * the current proposal changing its mind before it's answered. The turn deliberately does not move:
 * the other player still owes the reply.
 */
export async function amendProposal(matchId: string, actingUserId: string, input: ProposalInput) {
  const match = await loadForParticipant(matchId, actingUserId);

  if (match.status !== MatchStatus.NEGOTIATING) {
    throw new MatchValidationError("This match is no longer under negotiation");
  }
  if (match.awaitingResponseFromUserId === actingUserId) {
    throw new MatchValidationError("It's your turn to respond — accept, counter or decline instead");
  }
  await assertLocationExists(input.proposedLocationId);
  await assertOwnAddress(actingUserId, input.travelOriginAddressId);

  return commitMatchChange(async (tx) => {
    const updated = await tx.match.update({
      where: { id: matchId },
      data: {
        proposedDateTime: input.proposedDateTime,
        proposedLocationId: input.proposedLocationId,
        proposedComment: input.proposedComment,
        lastActionAt: new Date(),
      },
    });

    await tx.matchEvent.create({
      data: {
        matchId,
        type: MatchEventType.AMENDED,
        actorUserId: actingUserId,
        snapshotDateTime: input.proposedDateTime,
        snapshotLocationId: input.proposedLocationId,
        comment: input.proposedComment,
      },
    });

    await applyTravelOrigin(tx, matchId, actingUserId, input.travelOriginAddressId);

    return updated;
  }, { notify: () => notifyProposalUpdated(matchId, actingUserId, "AMENDED") });
}

/**
 * Answers an offer with a different date/location, handing the turn back to the other player.
 * Loops indefinitely — there's no cap on rounds of negotiation.
 */
export async function counterPropose(matchId: string, actingUserId: string, input: ProposalInput) {
  const match = await loadForParticipant(matchId, actingUserId);

  if (match.status !== MatchStatus.NEGOTIATING) {
    throw new MatchValidationError("This match is no longer under negotiation");
  }
  if (match.awaitingResponseFromUserId !== actingUserId) {
    throw new MatchValidationError("You've already responded — it's the other player's turn");
  }
  await assertLocationExists(input.proposedLocationId);
  await assertOwnAddress(actingUserId, input.travelOriginAddressId);

  return commitMatchChange(async (tx) => {
    const updated = await tx.match.update({
      where: { id: matchId },
      data: {
        proposedDateTime: input.proposedDateTime,
        proposedLocationId: input.proposedLocationId,
        proposedComment: input.proposedComment,
        awaitingResponseFromUserId: otherPlayer(match, actingUserId),
        lastActionAt: new Date(),
      },
    });

    await tx.matchEvent.create({
      data: {
        matchId,
        type: MatchEventType.COUNTER_PROPOSED,
        actorUserId: actingUserId,
        snapshotDateTime: input.proposedDateTime,
        snapshotLocationId: input.proposedLocationId,
        comment: input.proposedComment,
      },
    });

    await applyTravelOrigin(tx, matchId, actingUserId, input.travelOriginAddressId);

    return updated;
  }, { notify: () => notifyProposalUpdated(matchId, actingUserId, "COUNTER_PROPOSED") });
}

/**
 * The four result links a confirmed match needs — "I won" and "I lost" for each player. Only the
 * hash is stored, the same way invite and password reset tokens are handled: the raw token lives
 * in the email and nowhere else, so read access to the database doesn't let anyone submit a result.
 */
function issueResultTokens(challengerId: string, opponentId: string): IssuedResultToken[] {
  return [challengerId, opponentId].flatMap((userId) =>
    [ResultOutcome.WON, ResultOutcome.LOST].map((outcome) => ({
      userId,
      outcome,
      rawToken: generateOpaqueToken(),
    })),
  );
}

/**
 * Locks in the standing offer. Only the player who owes a reply can accept — otherwise a player
 * could accept their own proposal.
 */
export async function acceptMatch(
  matchId: string,
  actingUserId: string,
  travelOriginAddressId?: string | null,
) {
  const match = await loadForParticipant(matchId, actingUserId);

  if (match.status !== MatchStatus.NEGOTIATING) {
    throw new MatchValidationError("This match is no longer under negotiation");
  }
  if (match.awaitingResponseFromUserId !== actingUserId) {
    throw new MatchValidationError("You can't accept your own proposal");
  }
  await assertOwnAddress(actingUserId, travelOriginAddressId);

  const resultTokens = issueResultTokens(match.challengerId, match.opponentId);

  const updated = await commitMatchChange(async (tx) => {
    const updated = await tx.match.update({
      where: { id: matchId },
      data: {
        status: MatchStatus.SCHEDULED,
        scheduledDateTime: match.proposedDateTime,
        lastActionAt: new Date(),
      },
    });

    await tx.matchEvent.create({
      data: {
        matchId,
        type: MatchEventType.ACCEPTED,
        actorUserId: actingUserId,
        snapshotDateTime: match.proposedDateTime,
        snapshotLocationId: match.proposedLocationId,
      },
    });

    await tx.matchResultToken.createMany({
      data: resultTokens.map(({ userId, outcome, rawToken }) => ({
        matchId,
        userId,
        outcome,
        token: hashToken(rawToken),
      })),
    });

    await applyTravelOrigin(tx, matchId, actingUserId, travelOriginAddressId);

    return updated;
  });

  // Not a `notify` option like the rest: the raw tokens only exist here, so the confirmation
  // emails need something the committed match row can't give them.
  await notifyMatchConfirmed(matchId, match.proposedDateTime, resultTokens);

  return updated;
}

/** Rejects the challenge outright. Terminal — a fresh challenge means a new Match. */
export async function declineMatch(matchId: string, actingUserId: string) {
  const match = await loadForParticipant(matchId, actingUserId);

  if (match.status !== MatchStatus.NEGOTIATING) {
    throw new MatchValidationError("This match is no longer under negotiation");
  }
  if (match.awaitingResponseFromUserId !== actingUserId) {
    throw new MatchValidationError("You can't decline your own proposal");
  }

  return commitMatchChange(async (tx) => {
    const updated = await tx.match.update({
      where: { id: matchId },
      data: { status: MatchStatus.DECLINED, lastActionAt: new Date() },
    });

    await tx.matchEvent.create({
      data: { matchId, type: MatchEventType.DECLINED, actorUserId: actingUserId },
    });

    return updated;
  }, { notify: () => notifyMatchCalledOff(matchId, actingUserId, "DECLINED") });
}

/** The challenger pulls their own challenge before it's been agreed. Terminal. */
export async function withdrawMatch(matchId: string, actingUserId: string, comment?: string) {
  const match = await loadForParticipant(matchId, actingUserId);

  if (match.status !== MatchStatus.NEGOTIATING) {
    throw new MatchValidationError("This match is no longer under negotiation");
  }
  if (match.challengerId !== actingUserId) {
    throw new MatchValidationError("Only the challenger can withdraw this challenge");
  }

  return commitMatchChange(async (tx) => {
    const updated = await tx.match.update({
      where: { id: matchId },
      data: {
        status: MatchStatus.WITHDRAWN,
        cancellationComment: comment ?? null,
        lastActionAt: new Date(),
      },
    });

    await tx.matchEvent.create({
      data: { matchId, type: MatchEventType.WITHDRAWN, actorUserId: actingUserId, comment },
    });

    return updated;
  }, { notify: () => notifyMatchCalledOff(matchId, actingUserId, "WITHDRAWN", comment) });
}

/** Calls off an arranged match. Either player may do this, with an optional reason. */
export async function cancelMatch(matchId: string, actingUserId: string, comment?: string) {
  const match = await loadForParticipant(matchId, actingUserId);

  if (match.status !== MatchStatus.SCHEDULED) {
    throw new MatchValidationError("Only a scheduled match can be cancelled");
  }

  return commitMatchChange(async (tx) => {
    const updated = await tx.match.update({
      where: { id: matchId },
      data: {
        status: MatchStatus.CANCELLED,
        cancellationComment: comment ?? null,
        lastActionAt: new Date(),
      },
    });

    await tx.matchEvent.create({
      data: {
        matchId,
        type: MatchEventType.CANCELLED,
        actorUserId: actingUserId,
        comment,
      },
    });

    return updated;
  }, { notify: () => notifyMatchCalledOff(matchId, actingUserId, "CANCELLED", comment) });
}

/**
 * An admin calls off someone else's match: a negotiation that has stalled, or an arranged match
 * that can't go ahead. Allowed from NEGOTIATING and SCHEDULED only — once a score is in play the
 * dispute and override paths own the match instead.
 *
 * "Deleting" here is the same soft removal the rest of the app uses (Location.archivedAt,
 * User.removedAt): the row stays, the status becomes CANCELLED, and the ADMIN_CANCELLED event
 * records who did it and why, so both players still see what happened in the match thread.
 */
export async function adminCancelMatch(matchId: string, adminUserId: string, comment?: string) {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) {
    throw new MatchValidationError("Match not found");
  }

  if (match.status !== MatchStatus.NEGOTIATING && match.status !== MatchStatus.SCHEDULED) {
    throw new MatchValidationError("Only a match that's still being arranged or scheduled can be cancelled");
  }

  return commitMatchChange(async (tx) => {
    // awaitingResponseFromUserId is left as it was — it's non-nullable, and every other terminal
    // transition here leaves it behind too, since status alone decides whether anyone owes a reply.
    const updated = await tx.match.update({
      where: { id: matchId },
      data: {
        status: MatchStatus.CANCELLED,
        cancellationComment: comment ?? null,
        lastActionAt: new Date(),
      },
    });

    await tx.matchEvent.create({
      data: {
        matchId,
        type: MatchEventType.ADMIN_CANCELLED,
        actorUserId: adminUserId,
        comment,
      },
    });

    return updated;
  }, { notify: () => notifyMatchCalledOff(matchId, adminUserId, "ADMIN_CANCELLED", comment) });
}

export type ResultOutcomeInput = "WON" | "LOST" | "TIED";

/**
 * An outcome is reported from the reporter's own point of view, so resolve it to winner/loser.
 * A tie has neither, and is flagged instead — see Match.isTie.
 */
function resolveOutcome(
  match: { challengerId: string; opponentId: string },
  actingUserId: string,
  outcome: ResultOutcomeInput,
) {
  if (outcome === "TIED") {
    return { winnerId: null, loserId: null, isTie: true };
  }
  const other = otherPlayer(match, actingUserId);
  return outcome === "WON"
    ? { winnerId: actingUserId, loserId: other, isTie: false }
    : { winnerId: other, loserId: actingUserId, isTie: false };
}

/**
 * Reports the score for a played match, which the other player then has to answer. Either player
 * may report; the turn passes to whoever didn't.
 */
export async function proposeResult(
  matchId: string,
  actingUserId: string,
  outcome: ResultOutcomeInput,
) {
  const match = await loadForParticipant(matchId, actingUserId);

  if (match.status !== MatchStatus.SCHEDULED) {
    throw new MatchValidationError("Only a scheduled match can be scored");
  }

  const { winnerId, loserId, isTie } = resolveOutcome(match, actingUserId, outcome);

  return commitMatchChange(async (tx) => {
    const updated = await tx.match.update({
      where: { id: matchId },
      data: {
        status: MatchStatus.RESULT_PENDING,
        winnerId,
        loserId,
        isTie,
        resultReportedByUserId: actingUserId,
        awaitingResponseFromUserId: otherPlayer(match, actingUserId),
        lastActionAt: new Date(),
      },
    });

    await tx.matchEvent.create({
      data: {
        matchId,
        type: MatchEventType.RESULT_SUBMITTED,
        actorUserId: actingUserId,
        resultOutcome: outcome,
      },
    });

    return updated;
  }, { notify: () => notifyResultSubmitted(matchId, actingUserId, false) });
}

/** Reporter corrects their own score before the other player has answered. Turn stays put. */
export async function amendResult(
  matchId: string,
  actingUserId: string,
  outcome: ResultOutcomeInput,
) {
  const match = await loadForParticipant(matchId, actingUserId);

  if (match.status !== MatchStatus.RESULT_PENDING) {
    throw new MatchValidationError("There's no score awaiting a response on this match");
  }
  if (match.resultReportedByUserId !== actingUserId) {
    throw new MatchValidationError("Only whoever reported the score can change it");
  }

  const { winnerId, loserId, isTie } = resolveOutcome(match, actingUserId, outcome);

  return commitMatchChange(async (tx) => {
    const updated = await tx.match.update({
      where: { id: matchId },
      data: { winnerId, loserId, isTie, lastActionAt: new Date() },
    });

    await tx.matchEvent.create({
      data: {
        matchId,
        type: MatchEventType.RESULT_AMENDED,
        actorUserId: actingUserId,
        resultOutcome: outcome,
      },
    });

    return updated;
  }, { notify: () => notifyResultSubmitted(matchId, actingUserId, true) });
}

/**
 * The other player agrees the score, which completes the match and moves ladder points. Points are
 * applied inside the same transaction as the status change so a match can never be marked complete
 * without its points landing.
 */
export async function confirmResult(matchId: string, actingUserId: string) {
  const match = await loadForParticipant(matchId, actingUserId);

  if (match.status !== MatchStatus.RESULT_PENDING) {
    throw new MatchValidationError("There's no score awaiting a response on this match");
  }
  if (match.resultReportedByUserId === actingUserId) {
    throw new MatchValidationError("You can't confirm a score you reported yourself");
  }
  if (!match.isTie && (!match.winnerId || !match.loserId)) {
    throw new MatchValidationError("This match has no reported score");
  }

  const { winnerId, loserId } = match;

  // Even a tie changes the ladder: it goes on both players' records.
  return commitMatchChange(async (tx) => {
    // A tie moves nobody: points are only ever awarded for a win.
    const pointsAwarded =
      winnerId && loserId ? await applyLadderPoints(tx, winnerId, loserId) : 0;

    const updated = await tx.match.update({
      where: { id: matchId },
      data: {
        status: MatchStatus.COMPLETED,
        pointsAwarded,
        resultConfirmedAt: new Date(),
        lastActionAt: new Date(),
      },
    });

    await tx.matchEvent.create({
      data: { matchId, type: MatchEventType.RESULT_CONFIRMED, actorUserId: actingUserId },
    });

    // The match is settled, so every unused link dies with it — an "I won" link still sitting in
    // someone's inbox must not be able to reopen a completed match.
    await tx.matchResultToken.updateMany({
      where: { matchId, usedAt: null },
      data: { usedAt: new Date() },
    });

    return updated;
    // The points each player is told they're on are read after this commits, so they're the ones
    // that actually landed.
  }, { ladderChanged: true, notify: () => notifyResultFinalized(matchId) });
}

/** The other player disagrees with the score. Lands on the admin dashboard for a manual override. */
export async function rejectResult(matchId: string, actingUserId: string, comment?: string) {
  const match = await loadForParticipant(matchId, actingUserId);

  if (match.status !== MatchStatus.RESULT_PENDING) {
    throw new MatchValidationError("There's no score awaiting a response on this match");
  }
  if (match.resultReportedByUserId === actingUserId) {
    throw new MatchValidationError("You can't reject a score you reported yourself");
  }

  return commitMatchChange(async (tx) => {
    const updated = await tx.match.update({
      where: { id: matchId },
      data: { status: MatchStatus.RESULT_DISPUTED, lastActionAt: new Date() },
    });

    await tx.matchEvent.create({
      data: {
        matchId,
        type: MatchEventType.RESULT_DISPUTED,
        actorUserId: actingUserId,
        comment,
      },
    });

    return updated;
  }, { notify: () => notifyResultDisputed(matchId, actingUserId, comment) });
}

export async function adminOverrideResult(
  matchId: string,
  adminUserId: string,
  winnerId: string,
  loserId: string,
) {
  // TODO: force status=COMPLETED, isAdminOverride=true, write ADMIN_OVERRIDE_RESULT event,
  // calls applyLadderPoints, voids any unused MatchResultToken rows, and — like every other
  // transition here — notifies both players with { notify: () => notifyResultFinalized(matchId) }.
  throw new Error("Not implemented");
}

/**
 * Applies the ladder point adjustment for a completed match. Must run inside a transaction with
 * both User rows locked in a consistent order (by id) to avoid deadlocks under concurrent completions.
 */
export async function applyLadderPoints(
  tx: Prisma.TransactionClient,
  winnerId: string,
  loserId: string,
): Promise<number> {
  const [a, b] = [winnerId, loserId].sort();
  const [first, second] = await Promise.all([
    tx.user.findUniqueOrThrow({ where: { id: a } }),
    tx.user.findUniqueOrThrow({ where: { id: b } }),
  ]);
  const winner = first.id === winnerId ? first : second;
  const loser = first.id === loserId ? first : second;

  const isUpset = winner.points < loser.points;
  const newWinnerPoints = isUpset ? loser.points + 1 : winner.points + 1;

  await tx.user.update({
    where: { id: winner.id },
    data: { points: newWinnerPoints },
  });

  return newWinnerPoints - winner.points;
}
