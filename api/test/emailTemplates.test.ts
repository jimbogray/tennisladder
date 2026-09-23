import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderMatchThread } from "../src/emails/matchThread.js";
import { renderChallengeProposedEmail } from "../src/emails/templates/challengeProposed.js";
import { renderProposalUpdatedEmail } from "../src/emails/templates/proposalUpdated.js";
import { renderMatchCalledOffEmail } from "../src/emails/templates/matchCalledOff.js";
import { renderResultSubmittedEmail } from "../src/emails/templates/resultSubmitted.js";
import { renderResultFinalizedEmail } from "../src/emails/templates/resultFinalized.js";
import { renderMatchReminderEmail } from "../src/emails/templates/matchReminder.js";

/**
 * The templates are pure, so these assert the things a player would notice: that an email is
 * written from the recipient's side of the match, and that nothing a player typed can break out
 * into the HTML around it.
 */

describe("the negotiation thread", () => {
  it("renders each entry with who acted, what they offered and what they said", () => {
    const html = renderMatchThread([
      {
        actorFirstName: "Cara",
        action: "proposed",
        proposedDateTime: "Sat, 1 Jun 2030 at 6:00 PM",
        locationName: "Club courts",
        comment: "Saturday work for you?",
      },
      {
        actorFirstName: "Omar",
        action: "suggested instead",
        proposedDateTime: "Sun, 2 Jun 2030 at 6:00 PM",
        locationName: "Club courts",
        comment: null,
      },
    ]);

    assert.match(html, /Cara<\/strong> proposed Sat, 1 Jun 2030 at 6:00 PM at Club courts/);
    assert.match(html, /Saturday work for you\?/);
    assert.match(html, /Omar<\/strong> suggested instead/);
  });

  it("is empty for a thread with nothing in it, so a template can always include it", () => {
    assert.equal(renderMatchThread([]), "");
  });

  it("escapes what a player typed", () => {
    const html = renderMatchThread([
      {
        actorFirstName: "Cara",
        action: "proposed",
        proposedDateTime: null,
        locationName: null,
        comment: '<img src=x onerror="alert(1)">',
      },
    ]);

    assert.ok(!html.includes("<img"), "a comment escaped into the email's markup");
    assert.match(html, /&lt;img/);
  });
});

describe("challenge and proposal emails", () => {
  const base = {
    recipientFirstName: "Omar",
    challengerFirstName: "Cara",
    proposedDateTime: "Sat, 1 Jun 2030 at 6:00 PM",
    locationName: "Club courts",
    commentThread: [],
    matchUrl: "https://example.test/matches/abc",
  };

  it("names the challenger in the subject and links the match", () => {
    const { subject, html } = renderChallengeProposedEmail(base);

    assert.equal(subject, "Cara has challenged you to a match");
    assert.match(html, /https:\/\/example\.test\/matches\/abc/);
    assert.match(html, /your turn/);
  });

  it("distinguishes a counter-proposal from an amended one", () => {
    const shared = {
      recipientFirstName: "Cara",
      otherPlayerFirstName: "Omar",
      proposedDateTime: "Sun, 2 Jun 2030 at 6:00 PM",
      locationName: "Club courts",
      commentThread: [],
      matchUrl: "https://example.test/matches/abc",
    };

    assert.equal(
      renderProposalUpdatedEmail({ ...shared, change: "COUNTER_PROPOSED" }).subject,
      "Omar suggested a different time",
    );
    assert.equal(
      renderProposalUpdatedEmail({ ...shared, change: "AMENDED" }).subject,
      "Omar changed their proposal",
    );
  });
});

describe("the called-off email", () => {
  const base = {
    recipientFirstName: "Cara",
    otherPlayerFirstName: "Omar",
    scheduledDateTime: "Sat, 1 Jun 2030 at 6:00 PM",
    comment: null,
    ladderUrl: "https://example.test/ladder",
  } as const;

  it("says who ended it and how, for each way a match can end", () => {
    assert.match(renderMatchCalledOffEmail({ ...base, reason: "DECLINED" }).subject, /declined/);
    assert.match(renderMatchCalledOffEmail({ ...base, reason: "WITHDRAWN" }).subject, /withdrew/);
    assert.match(renderMatchCalledOffEmail({ ...base, reason: "CANCELLED" }).subject, /is off/);
    assert.match(
      renderMatchCalledOffEmail({ ...base, reason: "ADMIN_CANCELLED" }).html,
      /An admin has cancelled/,
    );
  });

  it("passes on the reason when one was given", () => {
    const { html } = renderMatchCalledOffEmail({
      ...base,
      reason: "CANCELLED",
      comment: "Courts flooded",
    });

    assert.match(html, /Courts flooded/);
  });
});

describe("result emails", () => {
  it("describes a reported score from the recipient's side", () => {
    const base = {
      recipientFirstName: "Omar",
      otherPlayerFirstName: "Cara",
      isTie: false,
      amended: false,
      matchUrl: "https://example.test/matches/abc",
    };

    assert.match(
      renderResultSubmittedEmail({ ...base, recipientWon: true }).html,
      /a win for you/,
    );
    assert.match(
      renderResultSubmittedEmail({ ...base, recipientWon: false }).html,
      /a win for them/,
    );
    assert.match(
      renderResultSubmittedEmail({ ...base, recipientWon: false, isTie: true }).html,
      /a draw/,
    );
  });

  it("reports the points a win moved, and says nothing moved otherwise", () => {
    const base = {
      recipientFirstName: "Cara",
      opponentFirstName: "Omar",
      ladderUrl: "https://example.test/ladder",
    };

    assert.match(
      renderResultFinalizedEmail({ ...base, outcome: "WON", pointsAwarded: 3, recipientPoints: 12 })
        .html,
      /worth 3 points\. You're on 12 now\./,
    );
    assert.match(
      renderResultFinalizedEmail({ ...base, outcome: "LOST", pointsAwarded: 3, recipientPoints: 9 })
        .html,
      /unchanged at 9/,
    );
    assert.match(
      renderResultFinalizedEmail({ ...base, outcome: "TIED", pointsAwarded: null, recipientPoints: 9 })
        .html,
      /finished level/,
    );
  });

  it("counts a single point as a point", () => {
    const { html } = renderResultFinalizedEmail({
      recipientFirstName: "Cara",
      opponentFirstName: "Omar",
      outcome: "WON",
      pointsAwarded: 1,
      recipientPoints: 1,
      ladderUrl: "https://example.test/ladder",
    });

    assert.match(html, /worth 1 point\./);
  });
});

describe("the match reminder", () => {
  const base = {
    recipientFirstName: "Cara",
    opponentFirstName: "Omar",
    scheduledDateTime: "Sat, 1 Jun 2030 at 6:00 PM",
    locationName: "Club courts",
    locationAddress: "1 Court Lane",
    matchUrl: "https://example.test/matches/abc",
  };

  it("states the lead time the job actually runs on", () => {
    assert.match(renderMatchReminderEmail({ ...base, leadMinutes: 60 }).subject, /in 1 hour/);
    assert.match(renderMatchReminderEmail({ ...base, leadMinutes: 120 }).subject, /in 2 hours/);
    assert.match(renderMatchReminderEmail({ ...base, leadMinutes: 30 }).subject, /in 30 minutes/);
  });

  it("includes the address when the court has one", () => {
    assert.match(renderMatchReminderEmail({ ...base, leadMinutes: 60 }).html, /1 Court Lane/);
    assert.doesNotMatch(
      renderMatchReminderEmail({ ...base, locationAddress: null, leadMinutes: 60 }).html,
      /\(\)/,
    );
  });
});
