import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import {
  acceptMatch,
  adminCancelMatch,
  amendProposal,
  amendResult,
  cancelMatch,
  confirmResult,
  counterPropose,
  declineMatch,
  proposeMatch,
  proposeResult,
  rejectResult,
  withdrawMatch,
} from "../src/services/matchService.js";
import {
  createLadderFixture,
  createUser,
  eventTypes,
  FUTURE_DATE,
  prisma,
  resetDatabase,
} from "./helpers/db.js";
import { assertRejected, transition } from "./helpers/invariants.js";

beforeEach(resetDatabase);
after(() => prisma.$disconnect());

const LATER_DATE = new Date("2030-06-08T18:00:00.000Z");

/** A fresh challenge, with the opponent owing the first reply. */
async function negotiating() {
  const fixture = await createLadderFixture();
  const match = await proposeMatch({
    challengerId: fixture.challenger.id,
    opponentId: fixture.opponent.id,
    proposedDateTime: FUTURE_DATE,
    proposedLocationId: fixture.location.id,
  });
  return { ...fixture, match };
}

/** A challenge the opponent has accepted, ready for a score. */
async function scheduled() {
  const context = await negotiating();
  await transition(context.match.id, () => acceptMatch(context.match.id, context.opponent.id));
  return context;
}

describe("proposing a challenge", () => {
  it("opens in NEGOTIATING with the turn on the opponent and a PROPOSED event", async () => {
    const { challenger, opponent, location } = await createLadderFixture();

    const match = await proposeMatch({
      challengerId: challenger.id,
      opponentId: opponent.id,
      proposedDateTime: FUTURE_DATE,
      proposedLocationId: location.id,
      proposedComment: "Saturday work for you?",
    });

    assert.equal(match.status, "NEGOTIATING");
    // The opponent has to answer first, otherwise the challenger could accept their own offer.
    assert.equal(match.awaitingResponseFromUserId, opponent.id);
    assert.equal(match.scheduledDateTime, null);
    assert.deepEqual(await eventTypes(match.id), ["PROPOSED"]);

    const [event] = await prisma.matchEvent.findMany({ where: { matchId: match.id } });
    assert.equal(event.actorUserId, challenger.id);
    assert.deepEqual(event.snapshotDateTime, FUTURE_DATE);
    assert.equal(event.snapshotLocationId, location.id);
    assert.equal(event.comment, "Saturday work for you?");
  });

  it("refuses a self-challenge", async () => {
    const { challenger, location } = await createLadderFixture();

    await assert.rejects(
      proposeMatch({
        challengerId: challenger.id,
        opponentId: challenger.id,
        proposedDateTime: FUTURE_DATE,
        proposedLocationId: location.id,
      }),
      /can't challenge yourself/,
    );
    assert.equal(await prisma.match.count(), 0);
  });

  it("refuses a coach-admin as opponent, who is off the ladder", async () => {
    const { challenger, location } = await createLadderFixture();
    const coachAdmin = await createUser({ role: "ADMIN", participatesInLadder: false });

    await assert.rejects(
      proposeMatch({
        challengerId: challenger.id,
        opponentId: coachAdmin.id,
        proposedDateTime: FUTURE_DATE,
        proposedLocationId: location.id,
      }),
      /can't be challenged/,
    );
    assert.equal(await prisma.match.count(), 0);
  });

  it("refuses a removed opponent, and a removed challenger", async () => {
    const { challenger, opponent, location } = await createLadderFixture();
    const removed = await createUser({ removedAt: new Date() });

    await assert.rejects(
      proposeMatch({
        challengerId: challenger.id,
        opponentId: removed.id,
        proposedDateTime: FUTURE_DATE,
        proposedLocationId: location.id,
      }),
      /Opponent not found/,
    );

    // A removed player's access token outlives their removal by up to the access-token TTL.
    await prisma.user.update({ where: { id: challenger.id }, data: { removedAt: new Date() } });
    await assert.rejects(
      proposeMatch({
        challengerId: challenger.id,
        opponentId: opponent.id,
        proposedDateTime: FUTURE_DATE,
        proposedLocationId: location.id,
      }),
      /no longer on the team/,
    );
    assert.equal(await prisma.match.count(), 0);
  });

  it("refuses a location that doesn't exist", async () => {
    const { challenger, opponent } = await createLadderFixture();

    await assert.rejects(
      proposeMatch({
        challengerId: challenger.id,
        opponentId: opponent.id,
        proposedDateTime: FUTURE_DATE,
        proposedLocationId: "not-a-location",
      }),
      /Location not found/,
    );
  });
});

describe("negotiating", () => {
  it("counter-proposing flips the turn and stays in NEGOTIATING", async () => {
    const { match, challenger, opponent, location } = await negotiating();

    await transition(match.id, () =>
      counterPropose(match.id, opponent.id, {
        proposedDateTime: LATER_DATE,
        proposedLocationId: location.id,
        proposedComment: "The 8th suits me better",
      }),
    );

    const updated = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    assert.equal(updated.status, "NEGOTIATING");
    assert.equal(updated.awaitingResponseFromUserId, challenger.id);
    assert.deepEqual(updated.proposedDateTime, LATER_DATE);
    assert.deepEqual(await eventTypes(match.id), ["PROPOSED", "COUNTER_PROPOSED"]);
  });

  it("loops indefinitely — there's no cap on rounds", async () => {
    const { match, challenger, opponent, location } = await negotiating();

    for (let round = 0; round < 4; round++) {
      const responder = round % 2 === 0 ? opponent : challenger;
      await transition(match.id, () =>
        counterPropose(match.id, responder.id, {
          proposedDateTime: new Date(FUTURE_DATE.getTime() + round * 86_400_000),
          proposedLocationId: location.id,
        }),
      );
    }

    const updated = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    assert.equal(updated.status, "NEGOTIATING");
    // Four counters starting with the opponent hands the turn back to them.
    assert.equal(updated.awaitingResponseFromUserId, opponent.id);
    assert.equal((await eventTypes(match.id)).length, 5);
  });

  it("refuses a counter-proposal from the side that doesn't owe a reply", async () => {
    const { match, challenger, location } = await negotiating();

    await assertRejected(
      match.id,
      () =>
        counterPropose(match.id, challenger.id, {
          proposedDateTime: LATER_DATE,
          proposedLocationId: location.id,
        }),
      /already responded/,
    );
  });

  it("amending revises the standing offer without moving the turn", async () => {
    const { match, challenger, opponent, location } = await negotiating();

    await transition(match.id, () =>
      amendProposal(match.id, challenger.id, {
        proposedDateTime: LATER_DATE,
        proposedLocationId: location.id,
      }),
    );

    const updated = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    assert.equal(updated.status, "NEGOTIATING");
    // Still the opponent's move: the challenger changed their own offer, they didn't answer one.
    assert.equal(updated.awaitingResponseFromUserId, opponent.id);
    assert.deepEqual(updated.proposedDateTime, LATER_DATE);
    assert.deepEqual(await eventTypes(match.id), ["PROPOSED", "AMENDED"]);
  });

  it("refuses an amendment from the side that owes a reply", async () => {
    const { match, opponent, location } = await negotiating();

    await assertRejected(
      match.id,
      () =>
        amendProposal(match.id, opponent.id, {
          proposedDateTime: LATER_DATE,
          proposedLocationId: location.id,
        }),
      /your turn to respond/,
    );
  });

  it("refuses any action from someone who isn't a player in the match", async () => {
    const { match, location } = await negotiating();
    const stranger = await createUser({ firstName: "Nosy" });

    await assertRejected(
      match.id,
      () =>
        counterPropose(match.id, stranger.id, {
          proposedDateTime: LATER_DATE,
          proposedLocationId: location.id,
        }),
      /not a player in this match/,
    );
    await assertRejected(match.id, () => acceptMatch(match.id, stranger.id), /not a player/);
    await assertRejected(match.id, () => declineMatch(match.id, stranger.id), /not a player/);
  });
});

describe("accepting", () => {
  it("moves to SCHEDULED, snapshots the time and issues four result tokens", async () => {
    const { match, challenger, opponent } = await negotiating();

    await transition(match.id, () => acceptMatch(match.id, opponent.id));

    const updated = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    assert.equal(updated.status, "SCHEDULED");
    assert.deepEqual(updated.scheduledDateTime, FUTURE_DATE);
    assert.deepEqual(await eventTypes(match.id), ["PROPOSED", "ACCEPTED"]);

    // "I won" and "I lost" for each player, hashed — the raw token only ever lives in the email.
    const tokens = await prisma.matchResultToken.findMany({ where: { matchId: match.id } });
    assert.equal(tokens.length, 4);
    assert.deepEqual(
      tokens.map((token) => `${token.userId === challenger.id ? "C" : "O"}:${token.outcome}`).sort(),
      ["C:LOST", "C:WON", "O:LOST", "O:WON"],
    );
    assert.equal(tokens.every((token) => token.usedAt === null), true);
    assert.equal(new Set(tokens.map((token) => token.token)).size, 4);
  });

  it("refuses an accept from the player who made the standing offer", async () => {
    const { match, challenger } = await negotiating();

    await assertRejected(match.id, () => acceptMatch(match.id, challenger.id), /can't accept your own/);
    assert.equal(await prisma.matchResultToken.count(), 0);
  });

  it("refuses a second accept once the match is scheduled", async () => {
    const { match, opponent } = await scheduled();

    await assertRejected(match.id, () => acceptMatch(match.id, opponent.id), /no longer under negotiation/);
  });
});

describe("terminal negotiation branches", () => {
  it("declining ends the match at DECLINED", async () => {
    const { match, opponent } = await negotiating();

    await transition(match.id, () => declineMatch(match.id, opponent.id));

    assert.equal((await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).status, "DECLINED");
    assert.deepEqual(await eventTypes(match.id), ["PROPOSED", "DECLINED"]);
    // Terminal: a fresh challenge means a new Match, not a revived one.
    await assertRejected(match.id, () => acceptMatch(match.id, opponent.id), /no longer under negotiation/);
  });

  it("only the challenger can withdraw their own challenge", async () => {
    const { match, challenger, opponent } = await negotiating();

    await assertRejected(match.id, () => withdrawMatch(match.id, opponent.id), /Only the challenger/);

    await transition(match.id, () => withdrawMatch(match.id, challenger.id, "Injured, sorry"));

    const updated = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    assert.equal(updated.status, "WITHDRAWN");
    assert.equal(updated.cancellationComment, "Injured, sorry");
    assert.deepEqual(await eventTypes(match.id), ["PROPOSED", "WITHDRAWN"]);
  });

  it("cancelling is for scheduled matches only, and either player may do it", async () => {
    const { match: negotiatingMatch, challenger } = await negotiating();
    await assertRejected(
      negotiatingMatch.id,
      () => cancelMatch(negotiatingMatch.id, challenger.id),
      /Only a scheduled match can be cancelled/,
    );

    const context = await scheduled();
    await transition(context.match.id, () =>
      cancelMatch(context.match.id, context.challenger.id, "Courts flooded"),
    );

    const updated = await prisma.match.findUniqueOrThrow({ where: { id: context.match.id } });
    assert.equal(updated.status, "CANCELLED");
    assert.equal(updated.cancellationComment, "Courts flooded");
    assert.deepEqual(await eventTypes(context.match.id), ["PROPOSED", "ACCEPTED", "CANCELLED"]);
  });

  it("an admin can cancel from NEGOTIATING and from SCHEDULED, but not after COMPLETED", async () => {
    const admin = await createUser({ role: "ADMIN" });

    const stalled = await negotiating();
    await transition(stalled.match.id, () =>
      adminCancelMatch(stalled.match.id, admin.id, "Stalled for a month"),
    );
    const cancelled = await prisma.match.findUniqueOrThrow({ where: { id: stalled.match.id } });
    assert.equal(cancelled.status, "CANCELLED");
    assert.deepEqual(await eventTypes(stalled.match.id), ["PROPOSED", "ADMIN_CANCELLED"]);
    const [, adminEvent] = await prisma.matchEvent.findMany({
      where: { matchId: stalled.match.id },
      orderBy: { createdAt: "asc" },
    });
    assert.equal(adminEvent.actorUserId, admin.id);
    assert.equal(adminEvent.comment, "Stalled for a month");

    const arranged = await scheduled();
    await transition(arranged.match.id, () => adminCancelMatch(arranged.match.id, admin.id));
    assert.equal(
      (await prisma.match.findUniqueOrThrow({ where: { id: arranged.match.id } })).status,
      "CANCELLED",
    );

    const finished = await completed();
    await assertRejected(
      finished.match.id,
      () => adminCancelMatch(finished.match.id, admin.id),
      /still being arranged or scheduled/,
    );
  });
});

describe("reporting a result", () => {
  it("either player may report, which moves to RESULT_PENDING and passes the turn", async () => {
    const { match, challenger, opponent } = await scheduled();

    await transition(match.id, () => proposeResult(match.id, challenger.id, "WON"));

    const updated = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    assert.equal(updated.status, "RESULT_PENDING");
    assert.equal(updated.resultReportedByUserId, challenger.id);
    assert.equal(updated.winnerId, challenger.id);
    assert.equal(updated.loserId, opponent.id);
    assert.equal(updated.isTie, false);
    assert.equal(updated.awaitingResponseFromUserId, opponent.id);
    assert.deepEqual(await eventTypes(match.id), ["PROPOSED", "ACCEPTED", "RESULT_SUBMITTED"]);
  });

  it("resolves the outcome from the reporter's point of view", async () => {
    const { match, challenger, opponent } = await scheduled();

    await transition(match.id, () => proposeResult(match.id, opponent.id, "LOST"));

    const updated = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    assert.equal(updated.winnerId, challenger.id);
    assert.equal(updated.loserId, opponent.id);
  });

  it("a tie has no winner or loser, only the flag", async () => {
    const { match, challenger } = await scheduled();

    await transition(match.id, () => proposeResult(match.id, challenger.id, "TIED"));

    const updated = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    assert.equal(updated.isTie, true);
    assert.equal(updated.winnerId, null);
    assert.equal(updated.loserId, null);
  });

  it("refuses a score on a match that was never scheduled", async () => {
    const { match, challenger } = await negotiating();

    await assertRejected(
      match.id,
      () => proposeResult(match.id, challenger.id, "WON"),
      /Only a scheduled match can be scored/,
    );
  });

  it("only the reporter can amend the score, and the turn stays put", async () => {
    const { match, challenger, opponent } = await scheduled();
    await transition(match.id, () => proposeResult(match.id, challenger.id, "WON"));

    await assertRejected(
      match.id,
      () => amendResult(match.id, opponent.id, "WON"),
      /Only whoever reported the score/,
    );

    await transition(match.id, () => amendResult(match.id, challenger.id, "LOST"));

    const updated = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    assert.equal(updated.status, "RESULT_PENDING");
    assert.equal(updated.winnerId, opponent.id);
    assert.equal(updated.loserId, challenger.id);
    assert.equal(updated.awaitingResponseFromUserId, opponent.id);
    assert.deepEqual(await eventTypes(match.id), [
      "PROPOSED",
      "ACCEPTED",
      "RESULT_SUBMITTED",
      "RESULT_AMENDED",
    ]);
  });
});

/** A match all the way through to COMPLETED, challenger winning. */
async function completed() {
  const context = await scheduled();
  await transition(context.match.id, () => proposeResult(context.match.id, context.challenger.id, "WON"));
  await transition(context.match.id, () => confirmResult(context.match.id, context.opponent.id));
  return context;
}

describe("confirming and disputing", () => {
  it("the other player confirming completes the match and voids every unused token", async () => {
    const { match, challenger, opponent } = await scheduled();
    await transition(match.id, () => proposeResult(match.id, challenger.id, "WON"));

    await transition(match.id, () => confirmResult(match.id, opponent.id));

    const updated = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    assert.equal(updated.status, "COMPLETED");
    assert.notEqual(updated.resultConfirmedAt, null);
    assert.deepEqual(await eventTypes(match.id), [
      "PROPOSED",
      "ACCEPTED",
      "RESULT_SUBMITTED",
      "RESULT_CONFIRMED",
    ]);

    // An "I won" link still sitting in an inbox must not be able to reopen a settled match.
    const tokens = await prisma.matchResultToken.findMany({ where: { matchId: match.id } });
    assert.equal(tokens.length, 4);
    assert.equal(tokens.every((token) => token.usedAt !== null), true);
  });

  it("refuses a confirmation from the player who reported the score", async () => {
    const { match, challenger } = await scheduled();
    await transition(match.id, () => proposeResult(match.id, challenger.id, "WON"));

    await assertRejected(
      match.id,
      () => confirmResult(match.id, challenger.id),
      /can't confirm a score you reported yourself/,
    );
  });

  it("rejecting the score sends the match to RESULT_DISPUTED", async () => {
    const { match, challenger, opponent } = await scheduled();
    await transition(match.id, () => proposeResult(match.id, challenger.id, "WON"));

    await transition(match.id, () => rejectResult(match.id, opponent.id, "I won in three"));

    const updated = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    assert.equal(updated.status, "RESULT_DISPUTED");
    assert.deepEqual(await eventTypes(match.id), [
      "PROPOSED",
      "ACCEPTED",
      "RESULT_SUBMITTED",
      "RESULT_DISPUTED",
    ]);
    const events = await prisma.matchEvent.findMany({
      where: { matchId: match.id, type: "RESULT_DISPUTED" },
    });
    assert.equal(events[0].comment, "I won in three");
  });

  it("a completed match is terminal for both confirm and reject", async () => {
    const { match, challenger, opponent } = await completed();

    await assertRejected(match.id, () => confirmResult(match.id, opponent.id), /no score awaiting/);
    await assertRejected(match.id, () => rejectResult(match.id, opponent.id), /no score awaiting/);
    await assertRejected(match.id, () => proposeResult(match.id, challenger.id, "WON"), /Only a scheduled/);
  });
});
