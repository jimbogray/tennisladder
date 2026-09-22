export const UserRole = {
  PLAYER: "PLAYER",
  ADMIN: "ADMIN",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

/** The kind of account an invite creates; see AccountType in api/prisma/schema.prisma. */
export const AccountType = {
  PLAYER: "PLAYER",
  ADMIN: "ADMIN",
  PLAYER_ADMIN: "PLAYER_ADMIN",
} as const;
export type AccountType = (typeof AccountType)[keyof typeof AccountType];

export const MatchStatus = {
  NEGOTIATING: "NEGOTIATING",
  DECLINED: "DECLINED",
  WITHDRAWN: "WITHDRAWN",
  SCHEDULED: "SCHEDULED",
  RESULT_PENDING: "RESULT_PENDING",
  RESULT_DISPUTED: "RESULT_DISPUTED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;
export type MatchStatus = (typeof MatchStatus)[keyof typeof MatchStatus];

// Kept in the order the Prisma enum declares them, which is how a drift between the two shows up
// on sight. AMENDED, WITHDRAWN, CANCELLED and RESULT_AMENDED were missing here while the API was
// already writing them, so MatchEventDto's type was narrower than what the API actually returns.
export const MatchEventType = {
  PROPOSED: "PROPOSED",
  AMENDED: "AMENDED",
  COUNTER_PROPOSED: "COUNTER_PROPOSED",
  ACCEPTED: "ACCEPTED",
  DECLINED: "DECLINED",
  WITHDRAWN: "WITHDRAWN",
  CANCELLED: "CANCELLED",
  RESULT_SUBMITTED: "RESULT_SUBMITTED",
  RESULT_AMENDED: "RESULT_AMENDED",
  RESULT_CONFIRMED: "RESULT_CONFIRMED",
  RESULT_DISPUTED: "RESULT_DISPUTED",
  ADMIN_OVERRIDE_RESULT: "ADMIN_OVERRIDE_RESULT",
  ADMIN_CANCELLED: "ADMIN_CANCELLED",
} as const;
export type MatchEventType = (typeof MatchEventType)[keyof typeof MatchEventType];

export const ResultOutcome = {
  WON: "WON",
  LOST: "LOST",
  TIED: "TIED",
} as const;
export type ResultOutcome = (typeof ResultOutcome)[keyof typeof ResultOutcome];

// Whose matches to show, and which statuses — two independent axes that combine.
export const MatchScope = {
  MINE: "mine",
  ALL: "all",
} as const;
export type MatchScope = (typeof MatchScope)[keyof typeof MatchScope];

/** Absent means every status. */
export const MatchStatusFilter = {
  COMPLETED: "completed",
  PENDING: "pending",
} as const;
export type MatchStatusFilter = (typeof MatchStatusFilter)[keyof typeof MatchStatusFilter];

/**
 * The NTRP ratings a player can hold, 2.5 to 7.0 in half steps. Kept as strings to match how the
 * Decimal(2,1) column is serialized everywhere else ("3.0", never "3").
 */
export const USTA_RATINGS = [
  "2.5",
  "3.0",
  "3.5",
  "4.0",
  "4.5",
  "5.0",
  "5.5",
  "6.0",
  "6.5",
  "7.0",
] as const;
export type UstaRating = (typeof USTA_RATINGS)[number];

/**
 * The ten portraits a player can pick from, stored on User.avatarId. Ids are deliberately
 * positional rather than descriptive: the drawings differ by skin tone, hair and kit, and none of
 * that belongs in a database value or in the name a screen reader reads out. What each one looks
 * like lives with the artwork, in web/src/components/avatarArt.tsx.
 */
export const AVATAR_IDS = [
  "avatar-1",
  "avatar-2",
  "avatar-3",
  "avatar-4",
  "avatar-5",
  "avatar-6",
  "avatar-7",
  "avatar-8",
  "avatar-9",
  "avatar-10",
] as const;
export type AvatarId = (typeof AVATAR_IDS)[number];

/** Narrows a stored/raw value to an AvatarId, so an unknown one falls back to initials. */
export function toAvatarId(value: string | null | undefined): AvatarId | null {
  return value && (AVATAR_IDS as readonly string[]).includes(value) ? (value as AvatarId) : null;
}
