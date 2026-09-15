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
  ties: number;
}

export interface LocationDto {
  id: string;
  name: string;
  address: string | null;
  archivedAt: string | null;
}

// Weather forecast for a location (GET /api/locations/:id/forecast). Always metric — the client
// converts for display. Weather codes are WMO weather interpretation codes.
export interface ForecastDayDto {
  // Calendar date local to the location, YYYY-MM-DD.
  date: string;
  weatherCode: number;
  temperatureMaxC: number;
  temperatureMinC: number;
  // Null where the provider has no precipitation model that far out.
  precipitationProbabilityMax: number | null;
}

export interface ForecastHourDto {
  // ISO instant at the top of the hour.
  time: string;
  weatherCode: number;
  temperatureC: number;
  precipitationProbability: number | null;
  windSpeedKmh: number;
  // False between sunset and sunrise, so clear skies can be shown as night rather than sun.
  isDay: boolean;
}

// Without `at` the forecast is a daily outlook; with `at` it's the hours around that time.
// NO_ADDRESS: the location has no address to look up. ADDRESS_NOT_FOUND: the address couldn't be
// geocoded. OUT_OF_RANGE: `at` is outside the provider's forecast horizon.
export type LocationForecastDto =
  | { status: "AVAILABLE"; days: ForecastDayDto[]; hours: ForecastHourDto[] }
  | { status: "NO_ADDRESS" | "ADDRESS_NOT_FOUND" | "OUT_OF_RANGE" };

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
  // Reason a scheduled match was called off; null unless status is CANCELLED.
  cancellationComment: string | null;
  // A tie has no winner or loser; this flag is what distinguishes it from an unplayed match.
  isTie: boolean;
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
