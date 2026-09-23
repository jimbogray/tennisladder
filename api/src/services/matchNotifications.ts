import { MatchEventType, ResultOutcome } from "@prisma/client";
import { googleCalendarUrlForMatch } from "@tennisladder/shared";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { sendEmail } from "./emailService.js";
import { formatMatchDateTimeForEmail } from "../emails/formatDateTime.js";
import type { MatchThreadEntry } from "../emails/matchThread.js";
import { renderChallengeProposedEmail } from "../emails/templates/challengeProposed.js";
import { renderProposalUpdatedEmail, type ProposalChange } from "../emails/templates/proposalUpdated.js";
import { renderMatchConfirmedEmail } from "../emails/templates/matchConfirmed.js";
import { renderMatchCalledOffEmail, type CalledOffReason } from "../emails/templates/matchCalledOff.js";
import { renderResultSubmittedEmail } from "../emails/templates/resultSubmitted.js";
import { renderResultDisputedEmail } from "../emails/templates/resultDisputed.js";
import { renderResultFinalizedEmail } from "../emails/templates/resultFinalized.js";
import { renderMatchReminderEmail } from "../emails/templates/matchReminder.js";
import { renderResultStaleEmail } from "../emails/templates/resultStale.js";

/**
 * Every notification a match sends, in one place.
 *
 * Each transition in `matchService` writes a `MatchEvent` and then calls the matching function
 * here, so the emails follow the same state machine the thread does rather than being bolted onto
 * whichever controller happened to be the entry point. Both result paths — the authenticated web
 * flow and the public token flow — go through `matchService`, so both notify from here without
 * either having to remember to.
 *
 * **Nothing in this module throws.** A notification is the last step of a transition that has
 * already committed: a player who accepted a match must not see an error because the mail provider
 * was down, and no transition is worth rolling back over an email. Failures are logged and
 * swallowed, except in the two job-facing functions, which report success so the job can decide
 * whether to mark the reminder as sent.
 */

const matchUrlFor = (matchId: string) => `${env.webAppUrl}/matches/${matchId}`;
const ladderUrl = () => `${env.webAppUrl}/ladder`;

/** A match with both players and the location it's set for. */
async function loadMatch(matchId: string) {
  return prisma.match.findUniqueOrThrow({
    where: { id: matchId },
    include: { challenger: true, opponent: true, proposedLocation: true },
  });
}

type LoadedMatch = Awaited<ReturnType<typeof loadMatch>>;

/** Splits a match's two players into whoever acted and whoever is being told about it. */
function sides(match: LoadedMatch, actorUserId: string) {
  return match.challengerId === actorUserId
    ? { actor: match.challenger, recipient: match.opponent }
    : { actor: match.opponent, recipient: match.challenger };
}

/**
 * Runs a notification, swallowing anything it throws. The caller's transition has already
 * committed by this point, so there is nothing left to undo and nothing useful to re-raise to.
 */
async function attempt(matchId: string, what: string, send: () => Promise<void>): Promise<boolean> {
  try {
    await send();
    return true;
  } catch (error) {
    console.error(`[matchNotifications] match ${matchId}: ${what} notification failed`, error);
    return false;
  }
}

/**
 * The negotiation so far, oldest first, as the words an email shows. Only the events that carry
 * something a player said or offered are worth repeating — an ACCEPTED row adds nothing the email
 * around it doesn't already say.
 */
async function threadFor(match: LoadedMatch): Promise<MatchThreadEntry[]> {
  const events = await prisma.matchEvent.findMany({
    where: {
      matchId: match.id,
      type: { in: [MatchEventType.PROPOSED, MatchEventType.AMENDED, MatchEventType.COUNTER_PROPOSED] },
    },
    orderBy: { createdAt: "asc" },
  });

  const action: Partial<Record<MatchEventType, string>> = {
    [MatchEventType.PROPOSED]: "proposed",
    [MatchEventType.AMENDED]: "changed it to",
    [MatchEventType.COUNTER_PROPOSED]: "suggested instead",
  };

  // Every location on the thread is the one the match currently points at: a snapshot only ever
  // records a location the proposal already moved to, and loading each by id would be a query per
  // event for a name that is almost always the same one.
  const locationName = match.proposedLocation.name;

  return events.map((event) => ({
    actorFirstName:
      event.actorUserId === match.challengerId
        ? match.challenger.firstName
        : event.actorUserId === match.opponentId
          ? match.opponent.firstName
          : null,
    action: action[event.type] ?? "updated the match",
    proposedDateTime: event.snapshotDateTime ? formatMatchDateTimeForEmail(event.snapshotDateTime) : null,
    locationName: event.snapshotLocationId === match.proposedLocationId ? locationName : null,
    comment: event.comment,
  }));
}

/** A new challenge, to the player who has to answer it. */
export async function notifyChallengeProposed(matchId: string): Promise<void> {
  await attempt(matchId, "challenge proposed", async () => {
    const match = await loadMatch(matchId);
    const { subject, html } = renderChallengeProposedEmail({
      recipientFirstName: match.opponent.firstName,
      challengerFirstName: match.challenger.firstName,
      proposedDateTime: formatMatchDateTimeForEmail(match.proposedDateTime),
      locationName: match.proposedLocation.name,
      commentThread: await threadFor(match),
      matchUrl: matchUrlFor(matchId),
    });
    await sendEmail({ to: match.opponent.email, subject, html });
  });
}

/** A revised or countered offer, to the player who now owes the reply. */
export async function notifyProposalUpdated(
  matchId: string,
  actorUserId: string,
  change: ProposalChange,
): Promise<void> {
  await attempt(matchId, "proposal updated", async () => {
    const match = await loadMatch(matchId);
    const { actor, recipient } = sides(match, actorUserId);
    const { subject, html } = renderProposalUpdatedEmail({
      recipientFirstName: recipient.firstName,
      otherPlayerFirstName: actor.firstName,
      change,
      proposedDateTime: formatMatchDateTimeForEmail(match.proposedDateTime),
      locationName: match.proposedLocation.name,
      commentThread: await threadFor(match),
      matchUrl: matchUrlFor(matchId),
    });
    await sendEmail({ to: recipient.email, subject, html });
  });
}

/**
 * One "I won"/"I lost" link: the raw token that goes in the email, and who it speaks for. A tie
 * has no link — there is nothing for the two players to claim separately — so only WON and LOST
 * are ever issued, even though the outcome type carries all three.
 */
export interface IssuedResultToken {
  userId: string;
  outcome: ResultOutcome;
  rawToken: string;
}

/**
 * The confirmation pair a newly agreed match sends, each with that player's own result links.
 *
 * The raw tokens only exist in the moment they're issued — the database keeps hashes — so this is
 * the one notification that can't reload everything it needs from the match id alone.
 */
export async function notifyMatchConfirmed(
  matchId: string,
  scheduledDateTime: Date,
  tokens: IssuedResultToken[],
): Promise<void> {
  await attempt(matchId, "match confirmed", async () => {
    const match = await loadMatch(matchId);
    const when = formatMatchDateTimeForEmail(scheduledDateTime);
    // One event for both emails: the players are being invited to the same match, and the link
    // carries a UTC instant, so each calendar shows it in its own owner's zone.
    const calendarUrl = googleCalendarUrlForMatch({
      challengerName: `${match.challenger.firstName} ${match.challenger.lastName}`,
      opponentName: `${match.opponent.firstName} ${match.opponent.lastName}`,
      scheduledDateTime,
      locationName: match.proposedLocation.name,
      locationAddress: match.proposedLocation.address,
      matchUrl: matchUrlFor(matchId),
    });
    const linkFor = (userId: string, outcome: ResultOutcome) => {
      const issued = tokens.find((token) => token.userId === userId && token.outcome === outcome);
      if (!issued) throw new Error(`no ${outcome} result token was issued for user ${userId}`);
      return `${env.webAppUrl}/results/confirm/${issued.rawToken}`;
    };

    for (const [recipient, other] of [
      [match.challenger, match.opponent],
      [match.opponent, match.challenger],
    ] as const) {
      const { subject, html } = renderMatchConfirmedEmail({
        recipientFirstName: recipient.firstName,
        opponentFirstName: other.firstName,
        scheduledDateTime: when,
        locationName: match.proposedLocation.name,
        calendarUrl,
        wonResultUrl: linkFor(recipient.id, ResultOutcome.WON),
        lostResultUrl: linkFor(recipient.id, ResultOutcome.LOST),
      });
      await sendEmail({ to: recipient.email, subject, html });
    }
  });
}

/**
 * A match that isn't happening, to whoever didn't end it. An admin cancellation is the exception:
 * the person who acted isn't a player, so both players are told.
 */
export async function notifyMatchCalledOff(
  matchId: string,
  actorUserId: string,
  reason: CalledOffReason,
  comment?: string,
): Promise<void> {
  await attempt(matchId, "match called off", async () => {
    const match = await loadMatch(matchId);
    // An admin isn't one of the players, so "whoever didn't end it" is both of them — and `sides`
    // would be meaningless for an actor who isn't in the match.
    let recipients: readonly (readonly [typeof match.challenger, typeof match.opponent])[];
    if (reason === "ADMIN_CANCELLED") {
      recipients = [
        [match.challenger, match.opponent],
        [match.opponent, match.challenger],
      ];
    } else {
      const { actor, recipient } = sides(match, actorUserId);
      recipients = [[recipient, actor]];
    }

    for (const [recipient, other] of recipients) {
      const { subject, html } = renderMatchCalledOffEmail({
        recipientFirstName: recipient.firstName,
        otherPlayerFirstName: other.firstName,
        reason,
        scheduledDateTime: match.scheduledDateTime
          ? formatMatchDateTimeForEmail(match.scheduledDateTime)
          : null,
        comment: comment ?? null,
        ladderUrl: ladderUrl(),
      });
      await sendEmail({ to: recipient.email, subject, html });
    }
  });
}

/** A score one player reported (or corrected), to the player who has to answer it. */
export async function notifyResultSubmitted(
  matchId: string,
  actorUserId: string,
  amended: boolean,
): Promise<void> {
  await attempt(matchId, "result submitted", async () => {
    const match = await loadMatch(matchId);
    const { actor, recipient } = sides(match, actorUserId);
    const { subject, html } = renderResultSubmittedEmail({
      recipientFirstName: recipient.firstName,
      otherPlayerFirstName: actor.firstName,
      recipientWon: match.winnerId === recipient.id,
      isTie: match.isTie,
      amended,
      matchUrl: matchUrlFor(matchId),
    });
    await sendEmail({ to: recipient.email, subject, html });
  });
}

/** A rejected score, to whoever reported it. Admins act on the dashboard, not by email. */
export async function notifyResultDisputed(
  matchId: string,
  actorUserId: string,
  comment?: string,
): Promise<void> {
  await attempt(matchId, "result disputed", async () => {
    const match = await loadMatch(matchId);
    const { actor, recipient } = sides(match, actorUserId);
    const { subject, html } = renderResultDisputedEmail({
      recipientFirstName: recipient.firstName,
      otherPlayerFirstName: actor.firstName,
      comment: comment ?? null,
      matchUrl: matchUrlFor(matchId),
    });
    await sendEmail({ to: recipient.email, subject, html });
  });
}

/** The settled result and what it did to the ladder, to both players. */
export async function notifyResultFinalized(matchId: string): Promise<void> {
  await attempt(matchId, "result finalized", async () => {
    const match = await loadMatch(matchId);

    for (const [recipient, other] of [
      [match.challenger, match.opponent],
      [match.opponent, match.challenger],
    ] as const) {
      const { subject, html } = renderResultFinalizedEmail({
        recipientFirstName: recipient.firstName,
        opponentFirstName: other.firstName,
        outcome: match.isTie ? "TIED" : match.winnerId === recipient.id ? "WON" : "LOST",
        pointsAwarded: match.pointsAwarded,
        recipientPoints: recipient.points,
        ladderUrl: ladderUrl(),
      });
      await sendEmail({ to: recipient.email, subject, html });
    }
  });
}

/**
 * The "your match is soon" nudge, to both players.
 *
 * Unlike the transition notifications this one reports whether it got through, because its caller
 * marks the match as reminded and must not do that for a reminder nobody received.
 */
export async function notifyMatchReminder(matchId: string): Promise<boolean> {
  return attempt(matchId, "match reminder", async () => {
    const match = await loadMatch(matchId);
    if (!match.scheduledDateTime) {
      throw new Error("a scheduled match has no scheduledDateTime");
    }
    const when = formatMatchDateTimeForEmail(match.scheduledDateTime);

    for (const [recipient, other] of [
      [match.challenger, match.opponent],
      [match.opponent, match.challenger],
    ] as const) {
      const { subject, html } = renderMatchReminderEmail({
        recipientFirstName: recipient.firstName,
        opponentFirstName: other.firstName,
        scheduledDateTime: when,
        locationName: match.proposedLocation.name,
        locationAddress: match.proposedLocation.address,
        matchUrl: matchUrlFor(matchId),
        leadMinutes: env.matchReminderLeadMinutes,
      });
      await sendEmail({ to: recipient.email, subject, html });
    }
  });
}

/** The "we still don't have a result" nudge, to both players. Reports success, as above. */
export async function notifyResultStale(matchId: string): Promise<boolean> {
  return attempt(matchId, "stale result reminder", async () => {
    const match = await loadMatch(matchId);
    if (!match.scheduledDateTime) {
      throw new Error("a scheduled match has no scheduledDateTime");
    }
    const when = formatMatchDateTimeForEmail(match.scheduledDateTime);

    for (const [recipient, other] of [
      [match.challenger, match.opponent],
      [match.opponent, match.challenger],
    ] as const) {
      const { subject, html } = renderResultStaleEmail({
        recipientFirstName: recipient.firstName,
        opponentFirstName: other.firstName,
        scheduledDateTime: when,
        matchUrl: matchUrlFor(matchId),
      });
      await sendEmail({ to: recipient.email, subject, html });
    }
  });
}
