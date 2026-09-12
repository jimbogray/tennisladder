import { Prisma, MatchEventType, MatchStatus } from "@prisma/client";
import { prisma } from "../config/prisma.js";

/** Thrown for invalid match actions (bad turn, self-challenge, etc.). Callers surface as a 400. */
export class MatchValidationError extends Error {}

export interface ProposeMatchInput {
  challengerId: string;
  opponentId: string;
  proposedDateTime: Date;
  proposedLocationId: string;
  proposedComment?: string;
}

export async function proposeMatch(input: ProposeMatchInput) {
  if (input.challengerId === input.opponentId) {
    throw new MatchValidationError("You can't challenge yourself");
  }

  const opponent = await prisma.user.findUnique({ where: { id: input.opponentId } });
  if (!opponent) {
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
  return prisma.$transaction(async (tx) => {
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

    return match;
  });
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

  return prisma.$transaction(async (tx) => {
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

    return updated;
  });
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

  return prisma.$transaction(async (tx) => {
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

    return updated;
  });
}

/**
 * Locks in the standing offer. Only the player who owes a reply can accept — otherwise a player
 * could accept their own proposal.
 */
export async function acceptMatch(matchId: string, actingUserId: string) {
  const match = await loadForParticipant(matchId, actingUserId);

  if (match.status !== MatchStatus.NEGOTIATING) {
    throw new MatchValidationError("This match is no longer under negotiation");
  }
  if (match.awaitingResponseFromUserId !== actingUserId) {
    throw new MatchValidationError("You can't accept your own proposal");
  }

  // TODO: generate the 4 MatchResultToken rows (WON/LOST x challenger/opponent) and send
  // confirmation emails once the result-submission flow exists.
  return prisma.$transaction(async (tx) => {
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

    return updated;
  });
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

  return prisma.$transaction(async (tx) => {
    const updated = await tx.match.update({
      where: { id: matchId },
      data: { status: MatchStatus.DECLINED, lastActionAt: new Date() },
    });

    await tx.matchEvent.create({
      data: { matchId, type: MatchEventType.DECLINED, actorUserId: actingUserId },
    });

    return updated;
  });
}

/** Calls off an arranged match. Either player may do this, with an optional reason. */
export async function cancelMatch(matchId: string, actingUserId: string, comment?: string) {
  const match = await loadForParticipant(matchId, actingUserId);

  if (match.status !== MatchStatus.SCHEDULED) {
    throw new MatchValidationError("Only a scheduled match can be cancelled");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.match.update({
      where: { id: matchId },
      data: { status: MatchStatus.CANCELLED, lastActionAt: new Date() },
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
  });
}

export type ResultOutcomeInput = "WON" | "LOST";

export async function submitResult(matchId: string, actingUserId: string, outcome: ResultOutcomeInput) {
  // TODO: first submission -> RESULT_PENDING; second matching submission -> COMPLETED
  // (calls applyLadderPoints in a transaction); second conflicting submission -> RESULT_DISPUTED.
  throw new Error("Not implemented");
}

export async function adminOverrideResult(
  matchId: string,
  adminUserId: string,
  winnerId: string,
  loserId: string,
) {
  // TODO: force status=COMPLETED, isAdminOverride=true, write ADMIN_OVERRIDE_RESULT event,
  // calls applyLadderPoints, voids any unused MatchResultToken rows.
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
