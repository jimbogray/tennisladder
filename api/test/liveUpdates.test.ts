import assert from "node:assert/strict";
import { after, afterEach, beforeEach, describe, it } from "node:test";
import type { LiveUpdateDto } from "@tennisladder/shared";
import { signAccessToken } from "../src/auth/authConfig.js";
import { subscribe } from "../src/services/liveUpdates.js";
import {
  acceptMatch,
  confirmResult,
  counterPropose,
  proposeMatch,
  proposeResult,
} from "../src/services/matchService.js";
import { createLadderFixture, FUTURE_DATE, prisma, resetDatabase } from "./helpers/db.js";
import { apiBaseUrl, stopApi } from "./helpers/http.js";

beforeEach(resetDatabase);
after(async () => {
  await stopApi();
  await prisma.$disconnect();
});

/** Collects what a connected page would have been sent, decoded from the event-stream frames. */
function listen() {
  const updates: LiveUpdateDto[] = [];
  const unsubscribe = subscribe({
    write(chunk: string) {
      assert.match(chunk, /^data: .*\n\n$/);
      updates.push(JSON.parse(chunk.slice("data: ".length)));
    },
  });
  return { updates, unsubscribe };
}

let listener: ReturnType<typeof listen>;
beforeEach(() => {
  listener = listen();
});
afterEach(() => listener.unsubscribe());

async function proposed() {
  const fixture = await createLadderFixture();
  const match = await proposeMatch({
    challengerId: fixture.challenger.id,
    opponentId: fixture.opponent.id,
    proposedDateTime: FUTURE_DATE,
    proposedLocationId: fixture.location.id,
  });
  return { ...fixture, match };
}

describe("live updates from match changes", () => {
  it("announces each change to the match once, and a completed match to the ladder too", async () => {
    const { challenger, opponent, match } = await proposed();
    assert.deepEqual(listener.updates, [{ type: "match", matchId: match.id }]);

    await acceptMatch(match.id, opponent.id);
    await proposeResult(match.id, challenger.id, "WON");
    listener.updates.length = 0;

    await confirmResult(match.id, opponent.id);
    assert.deepEqual(listener.updates, [
      { type: "match", matchId: match.id },
      { type: "ladder" },
    ]);
  });

  it("announces nothing when the change is refused", async () => {
    const { challenger, location, match } = await proposed();
    listener.updates.length = 0;

    // Not the challenger's turn: the opponent owes the reply.
    await assert.rejects(
      counterPropose(match.id, challenger.id, {
        proposedDateTime: FUTURE_DATE,
        proposedLocationId: location.id,
      }),
    );
    assert.deepEqual(listener.updates, []);
  });

  it("only announces a change once it has committed", async () => {
    const { opponent, match } = await proposed();
    // Read on another connection the moment it's announced, as a page refetching on it would. An
    // announcement from inside the transaction would read the match as still NEGOTIATING.
    let readOnAnnouncement: Promise<{ status: string }> | undefined;
    const unsubscribe = subscribe({
      write() {
        readOnAnnouncement ??= prisma.match.findUniqueOrThrow({ where: { id: match.id } });
      },
    });
    try {
      await acceptMatch(match.id, opponent.id);
      assert.ok(readOnAnnouncement, "the change was never announced");
      assert.equal((await readOnAnnouncement).status, "SCHEDULED");
    } finally {
      unsubscribe();
    }
  });
});

describe("GET /api/live", () => {
  it("refuses a caller without an access token", async () => {
    const response = await fetch(`${await apiBaseUrl()}/api/live`, {
      headers: { "X-Forwarded-For": "198.51.100.1" },
    });
    assert.equal(response.status, 401);
  });

  it("streams a change to a signed-in page", async () => {
    const { challenger, opponent, match } = await proposed();
    const accessToken = signAccessToken({
      sub: challenger.id,
      role: "PLAYER",
      participatesInLadder: true,
      profileComplete: true,
    });

    const controller = new AbortController();
    const response = await fetch(`${await apiBaseUrl()}/api/live`, {
      headers: { Authorization: `Bearer ${accessToken}`, "X-Forwarded-For": "198.51.100.2" },
      signal: controller.signal,
    });
    try {
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type") ?? "", /^text\/event-stream/);

      const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
      // The opening comment arrives first, so the subscription is in place before the change.
      assert.equal((await reader.read()).value, ": connected\n\n");

      await acceptMatch(match.id, opponent.id);
      assert.equal(
        (await reader.read()).value,
        `data: ${JSON.stringify({ type: "match", matchId: match.id })}\n\n`,
      );
    } finally {
      controller.abort();
    }
  });
});
