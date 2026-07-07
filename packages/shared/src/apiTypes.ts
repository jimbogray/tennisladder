import type {
  MatchEventType,
  MatchStatus,
  ResultOutcome,
  UserRole,
} from "./enums.js";

export interface PublicUserDto {
  id: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  participatesInLadder: boolean;
  points: number;
}

export interface SessionUserDto extends PublicUserDto {
  email: string;
  ustaRating: string | null;
  profileCompletedAt: string | null;
}

export interface LadderEntryDto {
  userId: string;
  firstName: string;
  lastName: string;
  points: number;
  wins: number;
  losses: number;
}

export interface LocationDto {
  id: string;
  name: string;
  archivedAt: string | null;
}

export interface MatchEventDto {
  id: string;
  type: MatchEventType;
  actorUserId: string | null;
  snapshotDateTime: string | null;
  snapshotLocationId: string | null;
  comment: string | null;
  resultOutcome: ResultOutcome | null;
  createdAt: string;
}

export interface MatchDto {
  id: string;
  status: MatchStatus;
  challengerId: string;
  opponentId: string;
  proposedDateTime: string;
  proposedLocationId: string;
  proposedComment: string | null;
  awaitingResponseFromUserId: string;
  scheduledDateTime: string | null;
  winnerId: string | null;
  loserId: string | null;
  pointsAwarded: number | null;
  isAdminOverride: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MatchDetailDto extends MatchDto {
  events: MatchEventDto[];
}

export interface ProposeMatchRequest {
  opponentId: string;
  proposedDateTime: string;
  proposedLocationId: string;
  proposedComment?: string;
}

export interface CounterProposeRequest {
  proposedDateTime: string;
  proposedLocationId: string;
  proposedComment?: string;
}

export interface SubmitResultRequest {
  outcome: ResultOutcome;
}
