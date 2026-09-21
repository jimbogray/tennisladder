import { MatchEventType, MatchStatus, type Prisma } from "@prisma/client";
import type { PlayerDataExportDto } from "@tennisladder/shared";
import { prisma } from "../config/prisma.js";
import { accountTypeFor } from "./registrationCodeService.js";

/**
 * The two things a player can ask us to do with their own data: hand it over, and get rid of it.
 *
 * Both are deliberately in one module, because they have to agree on one list: whatever the export
 * says we hold is what the erasure has to remove. A new personal column added to the schema and
 * only to one of these is a bug in the other.
 */

/** Thrown when an erasure can't proceed (unfinished matches, already erased). Surfaced as a 409. */
export class ErasureBlockedError extends Error {}

/**
 * What an erased row is left saying. A completed match needs a name against it or the other
 * player's history turns into a gap, so the row survives as this placeholder rather than being
 * deleted — which is also what the foreign keys from Match, MatchEvent and PointsAdjustment
 * require, none of which cascade.
 */
const ERASED_NAME = { firstName: "Former", lastName: "member" } as const;

/**
 * A unique, non-routable stand-in for the erased email address. `.invalid` is reserved for exactly
 * this (RFC 2606), so it can never reach a real mailbox, and the user id keeps the unique
 * constraint satisfied without saying anything about the person.
 */
const erasedEmail = (userId: string) => `erased-${userId}@removed.invalid`;

// Matches still needing both players. Erasing someone mid-negotiation would strand their opponent
// in a thread with a placeholder, so these block it the same way they block removal.
const OPEN_MATCH_STATUSES = [
  MatchStatus.NEGOTIATING,
  MatchStatus.SCHEDULED,
  MatchStatus.RESULT_PENDING,
  MatchStatus.RESULT_DISPUTED,
];

const EXPORT_ABOUT = [
  "This is everything the Tennis Ladder holds about you, as of the time above.",
  "Saved places have no address in them: an address you type is turned into map coordinates while it's being saved and then thrown away, so the coordinates are all we have.",
  "Your matches include the opponent's name, because you both agreed to play and each of you sees the other on the ladder. Nothing else about them is in here.",
  "Messages are the comments you typed while arranging matches. They are the only free text we keep from you.",
  "Your password is not in here. It is stored only as a hash, which cannot be turned back into the password you chose.",
  "To have all of this removed, ask a club admin. Your name on completed matches is replaced with a placeholder so other players' match history stays intact; everything else goes.",
];

/**
 * Everything the app holds about one player, for them to download.
 *
 * Reads are scoped to this user throughout. The one thing here that isn't strictly theirs is an
 * opponent's name on a shared match, which they can already see on the match itself.
 */
export async function exportPersonalData(userId: string): Promise<PlayerDataExportDto | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  const [addresses, matches, events, adjustments] = await Promise.all([
    prisma.userAddress.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      omit: { latitude: false, longitude: false },
    }),
    prisma.match.findMany({
      where: { OR: [{ challengerId: userId }, { opponentId: userId }] },
      orderBy: { createdAt: "asc" },
      include: {
        challenger: { select: { firstName: true, lastName: true } },
        opponent: { select: { firstName: true, lastName: true } },
        proposedLocation: { select: { name: true } },
      },
    }),
    // Only what they wrote: an event with no comment says nothing about them that the match row
    // doesn't already say.
    prisma.matchEvent.findMany({
      where: { actorUserId: userId, comment: { not: null } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.pointsAdjustment.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    about: EXPORT_ABOUT,
    account: {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      ustaRating: user.ustaRating?.toFixed(1) ?? null,
      phoneNumber: user.phoneNumber,
      accountType: accountTypeFor(user),
      onTheLadder: user.participatesInLadder,
      points: user.points,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      joinedAt: user.createdAt.toISOString(),
    },
    savedPlaces: addresses.map((address) => ({
      label: address.label,
      latitude: address.latitude,
      longitude: address.longitude,
      savedAt: address.createdAt.toISOString(),
    })),
    matches: matches.map((match) => {
      const iChallenged = match.challengerId === userId;
      const them = iChallenged ? match.opponent : match.challenger;
      return {
        id: match.id,
        status: match.status,
        opponentName: `${them.firstName} ${them.lastName}`,
        iChallenged,
        proposedFor: match.proposedDateTime.toISOString(),
        scheduledFor: match.scheduledDateTime?.toISOString() ?? null,
        location: match.proposedLocation.name,
        outcome: match.isTie
          ? ("tied" as const)
          : match.winnerId === userId
            ? ("won" as const)
            : match.loserId === userId
              ? ("lost" as const)
              : null,
        pointsAwarded: match.pointsAwarded,
        completedAt: match.resultConfirmedAt?.toISOString() ?? null,
      };
    }),
    messages: events.map((event) => ({
      matchId: event.matchId,
      type: event.type,
      // Narrowed by the query above; the type doesn't know that.
      comment: event.comment!,
      writtenAt: event.createdAt.toISOString(),
    })),
    pointsAdjustments: adjustments.map((adjustment) => ({
      previousPoints: adjustment.previousPoints,
      newPoints: adjustment.newPoints,
      reason: adjustment.reason,
      adjustedAt: adjustment.createdAt.toISOString(),
    })),
  };
}

/** What the erasure did, so the admin doing it can be told rather than having to trust it. */
export interface ErasureSummary {
  erasedAt: string;
  savedPlacesDeleted: number;
  messagesCleared: number;
  matchesKept: number;
}

/**
 * Erases one player's personal data for good, keeping only what other players' match history
 * needs. There is no undo, which is why this is an admin action behind a confirmation rather than
 * a button on a player's own profile.
 *
 * Returns null when there's no such user. Throws {@link ErasureBlockedError} when they still have
 * matches in play, or when their data has already been erased.
 *
 * What survives, and why:
 *
 * - The `User` row itself, as "Former member" with a `.invalid` email, because Match, MatchEvent
 *   and PointsAdjustment all reference it without cascading. Deleting it would take the other
 *   player's completed matches with it.
 * - Points, and the numbers on their points adjustments: ladder arithmetic other players' standings
 *   were computed from.
 * - Match rows, times, courts and results, for the same reason. What they *typed* about a match
 *   does not survive.
 * - Their registration code row, minus the invited email and the note an admin wrote, so the
 *   invite audit trail keeps its shape.
 */
export async function erasePersonalData(userId: string): Promise<ErasureSummary | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  if (user.personalDataErasedAt) {
    throw new ErasureBlockedError("This person's data has already been erased.");
  }

  const openMatches = await prisma.match.count({
    where: {
      status: { in: OPEN_MATCH_STATUSES },
      OR: [{ challengerId: userId }, { opponentId: userId }],
    },
  });
  if (openMatches > 0) {
    throw new ErasureBlockedError(
      `${user.firstName} has ${openMatches} unfinished ${openMatches === 1 ? "match" : "matches"}. ` +
        `Finish or cancel ${openMatches === 1 ? "it" : "them"} before erasing their data.`,
    );
  }

  const now = new Date();
  const [savedPlacesDeleted, messagesCleared, matchesKept] = await Promise.all([
    prisma.userAddress.count({ where: { userId } }),
    prisma.matchEvent.count({ where: { actorUserId: userId, comment: { not: null } } }),
    prisma.match.count({ where: { OR: [{ challengerId: userId }, { opponentId: userId }] } }),
  ]);

  // Everything in one transaction: a half-erased row is worse than an un-erased one, because it
  // reads as done.
  const writes: Prisma.PrismaPromise<unknown>[] = [
    // Saved places, and the match origins pointing at them (which cascade from the address).
    prisma.userAddress.deleteMany({ where: { userId } }),
    prisma.matchTravelOrigin.deleteMany({ where: { userId } }),
    // Phone numbers mid-confirmation, and anything that could still authenticate as them.
    prisma.phoneVerification.deleteMany({ where: { userId } }),
    prisma.refreshToken.deleteMany({ where: { userId } }),
    prisma.passwordResetToken.deleteMany({ where: { userId } }),
    prisma.matchResultToken.deleteMany({ where: { userId } }),
    // Free text they wrote. The events stay: the other player's negotiation thread is built from
    // them, and their types and times say nothing personal.
    prisma.matchEvent.updateMany({
      where: { actorUserId: userId, comment: { not: null } },
      data: { comment: null },
    }),
    // A challenge's opening comment is the challenger's own words.
    prisma.match.updateMany({
      where: { challengerId: userId, proposedComment: { not: null } },
      data: { proposedComment: null },
    }),
    // Why an admin changed their points could name them; the numbers are the audit trail.
    prisma.pointsAdjustment.updateMany({
      where: { userId, reason: { not: null } },
      data: { reason: null },
    }),
    prisma.user.update({
      where: { id: userId },
      data: {
        ...ERASED_NAME,
        email: erasedEmail(userId),
        passwordHash: null,
        googleId: null,
        phoneNumber: null,
        ustaRating: null,
        emailVerifiedAt: null,
        // Erasure implies leaving: an erased row can't sign in, and shouldn't sit on the ladder
        // as a placeholder. Kept as the original removal date where there was one.
        removedAt: user.removedAt ?? now,
        personalDataErasedAt: now,
      },
    }),
  ];

  // The cancellation comment on a shared match is only theirs if they were the one who cancelled,
  // which the event trail is what records.
  const cancellationsByThem = await prisma.matchEvent.findMany({
    where: {
      actorUserId: userId,
      type: {
        in: [MatchEventType.CANCELLED, MatchEventType.WITHDRAWN, MatchEventType.DECLINED],
      },
      match: { cancellationComment: { not: null } },
    },
    select: { matchId: true },
  });
  if (cancellationsByThem.length > 0) {
    writes.push(
      prisma.match.updateMany({
        where: { id: { in: cancellationsByThem.map((event) => event.matchId) } },
        data: { cancellationComment: null },
      }),
    );
  }

  if (user.registrationCodeId) {
    writes.push(
      prisma.registrationCode.update({
        where: { id: user.registrationCodeId },
        data: { invitedEmail: null, intendedForNote: null },
      }),
    );
  }

  await prisma.$transaction(writes);

  return { erasedAt: now.toISOString(), savedPlacesDeleted, messagesCleared, matchesKept };
}
