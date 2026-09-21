import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import {
  acceptMatch,
  applyLadderPoints,
  confirmResult,
  proposeMatch,
  proposeResult,
} from "../src/services/matchService.js";
import { createLadderFixture, FUTURE_DATE, prisma, resetDatabase } from "./helpers/db.js";
import { transition } from "./helpers/invariants.js";

beforeEach(resetDatabase);
after(() => prisma.$disconnect());

/**
 * The formula from docs/architecture.md, applied once at the transition into COMPLETED:
 *
 *   if winner.points < loser.points:  winner.points = loser.points + 1   # upset
 *   else:                             winner.points = winner.points + 1  # standard win
 *   loser.points unchanged
 */
async function award(winnerPoints: number, loserPoints: number) {
  const { challenger: winner, opponent: loser } = await createLadderFixture({
    challengerPoints: winnerPoints,
    opponentPoints: loserPoints,
  });

  const awarded = await prisma.$transaction((tx) => applyLadderPoints(tx, winner.id, loser.id));

  const [winnerAfter, loserAfter] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: winner.id } }),
    prisma.user.findUniqueOrThrow({ where: { id: loser.id } }),
  ]);
  return { awarded, winnerPoints: winnerAfter.points, loserPoints: loserAfter.points };
}

describe("the points formula", () => {
  it("gives a standard win one point when the winner was already ahead", async () => {
    assert.deepEqual(await award(9, 3), { awarded: 1, winnerPoints: 10, loserPoints: 3 });
  });

  it("lifts an upset winner one clear of the player they beat", async () => {
    // 2 -> 10, not 2 -> 3: beating someone far above you is what moves you up the ladder.
    assert.deepEqual(await award(2, 9), { awarded: 8, winnerPoints: 10, loserPoints: 9 });
  });

  it("treats equal points as a standard win, not an upset", async () => {
    // The formula is a strict `<`, so level players give the winner one point rather than two.
    assert.deepEqual(await award(4, 4), { awarded: 1, winnerPoints: 5, loserPoints: 4 });
  });

  it("never takes points off the loser", async () => {
    assert.deepEqual(await award(0, 0), { awarded: 1, winnerPoints: 1, loserPoints: 0 });
    assert.deepEqual(await award(0, 25), { awarded: 26, winnerPoints: 26, loserPoints: 25 });
  });
});

describe("points at the transition into COMPLETED", () => {
  async function playedMatch(challengerPoints: number, opponentPoints: number) {
    const { challenger, opponent, location } = await createLadderFixture({
      challengerPoints,
      opponentPoints,
    });
    const match = await proposeMatch({
      challengerId: challenger.id,
      opponentId: opponent.id,
      proposedDateTime: FUTURE_DATE,
      proposedLocationId: location.id,
    });
    await transition(match.id, () => acceptMatch(match.id, opponent.id));
    return { match, challenger, opponent };
  }

  it("applies the award and records it on the match", async () => {
    const { match, challenger, opponent } = await playedMatch(1, 7);
    await transition(match.id, () => proposeResult(match.id, challenger.id, "WON"));

    await transition(match.id, () => confirmResult(match.id, opponent.id));

    const completed = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    assert.equal(completed.pointsAwarded, 7);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: challenger.id } })).points, 8);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: opponent.id } })).points, 7);
  });

  it("moves nobody on a tie", async () => {
    const { match, challenger, opponent } = await playedMatch(5, 5);
    await transition(match.id, () => proposeResult(match.id, challenger.id, "TIED"));

    await transition(match.id, () => confirmResult(match.id, opponent.id));

    const completed = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    assert.equal(completed.status, "COMPLETED");
    assert.equal(completed.pointsAwarded, 0);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: challenger.id } })).points, 5);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: opponent.id } })).points, 5);
  });

  it("applies the award exactly once, even if the confirmation is replayed", async () => {
    const { match, challenger, opponent } = await playedMatch(3, 1);
    await transition(match.id, () => proposeResult(match.id, challenger.id, "WON"));
    await transition(match.id, () => confirmResult(match.id, opponent.id));

    await assert.rejects(confirmResult(match.id, opponent.id), /no score awaiting/);

    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: challenger.id } })).points, 4);
  });

  it("leaves points alone when the score is disputed rather than confirmed", async () => {
    const { match, challenger, opponent } = await playedMatch(3, 6);
    await transition(match.id, () => proposeResult(match.id, challenger.id, "WON"));

    // RESULT_PENDING is not COMPLETED: the winner's points must not move until it is.
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: challenger.id } })).points, 3);
    assert.equal((await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).pointsAwarded, null);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: opponent.id } })).points, 6);
  });
});
