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

export const MatchEventType = {
  PROPOSED: "PROPOSED",
  COUNTER_PROPOSED: "COUNTER_PROPOSED",
  ACCEPTED: "ACCEPTED",
  DECLINED: "DECLINED",
  RESULT_SUBMITTED: "RESULT_SUBMITTED",
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
