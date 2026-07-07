import type { Prisma } from "@prisma/client";

export interface ProposeMatchInput {
  challengerId: string;
  opponentId: string;
  proposedDateTime: Date;
  proposedLocationId: string;
  proposedComment?: string;
}

export async function proposeMatch(input: ProposeMatchInput) {
  // TODO: reject if challenger or opponent has participatesInLadder=false (coach-admins),
  // and reject self-challenge. See docs/architecture.md API Endpoints > Matches.
  throw new Error("Not implemented");
}

export async function counterPropose(matchId: string, actingUserId: string, input: {
  proposedDateTime: Date;
  proposedLocationId: string;
  proposedComment?: string;
}) {
  // TODO: verify actingUserId === match.awaitingResponseFromUserId, flip the turn,
  // write a COUNTER_PROPOSED MatchEvent, update Match.proposed* fields.
  throw new Error("Not implemented");
}

export async function acceptMatch(matchId: string, actingUserId: string) {
  // TODO: verify turn, set status=SCHEDULED, snapshot scheduledDateTime, write ACCEPTED event,
  // generate 4 MatchResultToken rows (WON/LOST x challenger/opponent), send confirmation emails.
  throw new Error("Not implemented");
}

export async function declineMatch(matchId: string, actingUserId: string) {
  // TODO: verify turn, set status=DECLINED (terminal), write DECLINED event.
  throw new Error("Not implemented");
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
