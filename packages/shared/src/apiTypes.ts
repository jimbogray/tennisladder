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
  // Serialized from a Decimal(2,1) to one decimal place; null when no rating is recorded.
  ustaRating: string | null;
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
  // Serialized from a Decimal(2,1); null for players who haven't recorded a rating.
  ustaRating: string | null;
  points: number;
  wins: number;
  losses: number;
}

export interface LocationDto {
  id: string;
  name: string;
  address: string | null;
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
  // Joined participants, narrowed to the public shape — a player must never see another
  // player's email address.
  challenger: PublicUserDto;
  opponent: PublicUserDto;
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
  proposedLocation: LocationDto;
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
