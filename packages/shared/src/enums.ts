export const UserRole = {
  PLAYER: "PLAYER",
  ADMIN: "ADMIN",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const MatchStatus = {
  NEGOTIATING: "NEGOTIATING",
  DECLINED: "DECLINED",
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
} as const;
export type ResultOutcome = (typeof ResultOutcome)[keyof typeof ResultOutcome];

export const MatchFilter = {
  ALL: "all",
  COMPLETED: "completed",
  PENDING: "pending",
} as const;
export type MatchFilter = (typeof MatchFilter)[keyof typeof MatchFilter];
