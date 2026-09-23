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
import { runMatchReminderJob } from "../src/jobs/matchReminderJob.js";
import { runStaleResultReminderJob } from "../src/jobs/staleResultReminderJob.js";
import { createLadderFixture, createUser, FUTURE_DATE, prisma, resetDatabase } from "./helpers/db.js";
import { recipientsOf } from "./helpers/emails.js";
import { notifyMatchReminder } from "../src/services/matchNotifications.js";

beforeEach(resetDatabase);
after(() => prisma.$disconnect());

const LATER_DATE = new Date("2030-06-08T18:00:00.000Z");

/** Runs something whose failure is the point, without its console.error landing in the output. */
async function withoutErrorLogs(action: () => Promise<void>): Promise<void> {
  const original = console.error;
  console.error = () => {};
  try {
    await action();
  } finally {
    console.error = original;
  }
}

/**
 * Every transition is meant to tell whoever didn't make it. These tests assert the routing — who
 * hears about what — because that is what a player notices when it's wrong: an email about your
 * own action, or silence when the other player moved. The wording lives in the template tests.
 */

async function negotiating() {
  const fixture = await createLadderFixture();
  const match = await proposeMatch({
    challengerId: fixture.challenger.id,
    opponentId: fixture.opponent.id,
    proposedDateTime: FUTURE_DATE,
    proposedLocationId: fixture.location.id,
    proposedComment: "Saturday work for you?",
  });
  return { ...fixture, match };
}

async function scheduled() {
  const context = await negotiating();
  await acceptMatch(context.match.id, context.opponent.id);
  return context;
}

describe("who each match transition emails", () => {
  it("tells the opponent about a new challenge, and nobody else", async () => {
    const { challenger, opponent, location } = await createLadderFixture();

    const sent = await recipientsOf(() =>
      proposeMatch({
        challengerId: challenger.id,
        opponentId: opponent.id,
        proposedDateTime: FUTURE_DATE,
        proposedLocationId: location.id,
      }),
    );

    assert.deepEqual(sent, [opponent.email]);
  });

  it("tells the challenger when the opponent counters", async () => {
    const { challenger, opponent, location, match } = await negotiating();

    const sent = await recipientsOf(() =>
      counterPropose(match.id, opponent.id, {
        proposedDateTime: LATER_DATE,
        proposedLocationId: location.id,
        proposedComment: "Sunday is better",
      }),
    );

    assert.deepEqual(sent, [challenger.email]);
  });

  it("tells the player who owes a reply when the proposer amends their own offer", async () => {
    const { challenger, opponent, location, match } = await negotiating();

    const sent = await recipientsOf(() =>
      amendProposal(match.id, challenger.id, {
        proposedDateTime: LATER_DATE,
        proposedLocationId: location.id,
      }),
    );

    assert.deepEqual(sent, [opponent.email]);
  });

  it("tells both players when a challenge is accepted", async () => {
    const { challenger, opponent, match } = await negotiating();

    const sent = await recipientsOf(() => acceptMatch(match.id, opponent.id));

    assert.deepEqual(sent.sort(), [challenger.email, opponent.email].sort());
  });

  it("tells the challenger when their challenge is declined", async () => {
    const { challenger, opponent, match } = await negotiating();

    const sent = await recipientsOf(() => declineMatch(match.id, opponent.id));

    assert.deepEqual(sent, [challenger.email]);
  });

  it("tells the opponent when the challenger withdraws", async () => {
    const { opponent, match } = await negotiating();

    const sent = await recipientsOf(() => withdrawMatch(match.id, match.challengerId, "Injured"));

    assert.deepEqual(sent, [opponent.email]);
  });

  it("tells the other player when a scheduled match is called off", async () => {
    const { challenger, opponent, match } = await scheduled();

    const sent = await recipientsOf(() => cancelMatch(match.id, challenger.id, "Courts flooded"));

    assert.deepEqual(sent, [opponent.email]);
  });

  it("tells both players when an admin cancels, since neither of them did it", async () => {
    const { challenger, opponent, match } = await scheduled();
    const admin = await createUser({ firstName: "Ada", role: "ADMIN" });

    const sent = await recipientsOf(() => adminCancelMatch(match.id, admin.id, "Club closed"));

    assert.deepEqual(sent.sort(), [challenger.email, opponent.email].sort());
    assert.ok(!sent.includes(admin.email), "the admin who cancelled was emailed about it");
  });
});

describe("who each result transition emails", () => {
  it("asks the other player to answer a reported score", async () => {
    const { challenger, opponent, match } = await scheduled();

    const sent = await recipientsOf(() => proposeResult(match.id, challenger.id, "WON"));

    assert.deepEqual(sent, [opponent.email]);
  });

  it("tells the other player when the reporter corrects the score", async () => {
    const { challenger, opponent, match } = await scheduled();
    await proposeResult(match.id, challenger.id, "WON");

    const sent = await recipientsOf(() => amendResult(match.id, challenger.id, "LOST"));

    assert.deepEqual(sent, [opponent.email]);
  });

  it("tells both players once the result is settled", async () => {
    const { challenger, opponent, match } = await scheduled();
    await proposeResult(match.id, challenger.id, "WON");

    const sent = await recipientsOf(() => confirmResult(match.id, opponent.id));

    assert.deepEqual(sent.sort(), [challenger.email, opponent.email].sort());
  });

  it("tells whoever reported a score that it's been disputed", async () => {
    const { challenger, opponent, match } = await scheduled();
    await proposeResult(match.id, challenger.id, "WON");

    const sent = await recipientsOf(() => rejectResult(match.id, opponent.id, "I won that"));

    assert.deepEqual(sent, [challenger.email]);
  });
});

describe("the reminder jobs", () => {
  /** Puts a scheduled match in the past or near future, which is what makes a job pick it up. */
  async function scheduledAt(when: Date) {
    const context = await scheduled();
    await prisma.match.update({
      where: { id: context.match.id },
      data: { scheduledDateTime: when, proposedDateTime: when },
    });
    return context;
  }

  it("reminds both players about a match that's nearly due, then marks it reminded", async () => {
    const { challenger, opponent, match } = await scheduledAt(new Date(Date.now() + 30 * 60 * 1000));

    const sent = await recipientsOf(runMatchReminderJob);

    assert.deepEqual(sent.sort(), [challenger.email, opponent.email].sort());
    const after = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    assert.ok(after.reminderSentAt, "the match wasn't marked as reminded");
  });

  it("only reminds once", async () => {
    await scheduledAt(new Date(Date.now() + 30 * 60 * 1000));
    await runMatchReminderJob();

    const sent = await recipientsOf(runMatchReminderJob);

    assert.deepEqual(sent, []);
  });

  it("reports a failed reminder rather than throwing, which is what keeps the flag unset", async () => {
    // The job marks a match as reminded only when the notification says it got through, so that a
    // failed send is retried next run instead of burning the single reminder a match gets. A match
    // with no scheduled time can't be described in an email, standing in here for any failed send.
    const { match } = await scheduled();
    await prisma.match.update({ where: { id: match.id }, data: { scheduledDateTime: null } });

    const sent = await recipientsOf(() =>
      withoutErrorLogs(async () => {
        assert.equal(await notifyMatchReminder(match.id), false);
      }),
    );

    assert.deepEqual(sent, []);
  });

  it("nudges both players about a match that was never scored, then marks it nudged", async () => {
    const { challenger, opponent, match } = await scheduledAt(
      new Date(Date.now() - 48 * 60 * 60 * 1000),
    );

    const sent = await recipientsOf(runStaleResultReminderJob);

    assert.deepEqual(sent.sort(), [challenger.email, opponent.email].sort());
    const after = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    assert.ok(after.staleResultReminderSentAt, "the match wasn't marked as nudged");
  });
});
