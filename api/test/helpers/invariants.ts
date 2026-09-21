import assert from "node:assert/strict";
import { prisma } from "../../src/config/prisma.js";

/**
 * Runs one match action and enforces the invariant `docs/architecture.md` calls out: a `Match`
 * status change must always be accompanied by a `MatchEvent`. The negotiation thread and the
 * notification emails are both rendered from those events, so a status that moves without one
 * leaves both showing a match that never changed.
 *
 * Wrap every transition a test drives in this, rather than asserting the event separately — the
 * point is that no path can quietly skip it.
 */
export async function transition<T>(matchId: string, action: () => Promise<T>): Promise<T> {
  const before = await snapshot(matchId);
  const result = await action();
  const after = await snapshot(matchId);

  if (after.status !== before.status) {
    assert.ok(
      after.eventCount > before.eventCount,
      `match ${matchId} moved ${before.status} -> ${after.status} without writing a MatchEvent`,
    );
  }
  return result;
}

/**
 * The same check for an action that is expected to be refused: nothing about the match may move,
 * and no event may be left behind by a half-applied transaction.
 */
export async function assertRejected(
  matchId: string,
  action: () => Promise<unknown>,
  expectedMessage: RegExp,
): Promise<void> {
  const before = await snapshot(matchId);
  await assert.rejects(action, expectedMessage);
  const after = await snapshot(matchId);

  assert.equal(after.status, before.status, "a refused action changed the match status");
  assert.equal(after.eventCount, before.eventCount, "a refused action wrote a MatchEvent");
  assert.equal(
    after.awaitingResponseFromUserId,
    before.awaitingResponseFromUserId,
    "a refused action moved the turn",
  );
}

async function snapshot(matchId: string) {
  const [match, eventCount] = await Promise.all([
    prisma.match.findUniqueOrThrow({ where: { id: matchId } }),
    prisma.matchEvent.count({ where: { matchId } }),
  ]);
  return {
    status: match.status,
    awaitingResponseFromUserId: match.awaitingResponseFromUserId,
    eventCount,
  };
}
