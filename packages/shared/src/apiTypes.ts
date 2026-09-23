import type {
  AccountType,
  AvatarId,
  MatchEventType,
  MatchStatus,
  ResultOutcome,
  UserRole,
  UstaRating,
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
  // The portrait the player picked; null means they haven't, and their initials are shown instead.
  avatarId: AvatarId | null;
}

export interface SessionUserDto extends PublicUserDto {
  email: string;
  ustaRating: string | null;
  profileCompletedAt: string | null;
  // When the account was registered, shown on the profile page.
  createdAt: string;
  // The notification number the user registered, in E.164 (+15551234567), or null for none. Only
  // ever set once a texted confirmation code came back, so a value here means "confirmed".
  phoneNumber: string | null;
}

// POST /api/players/me/phone — texts a confirmation code to the number being registered.
export interface StartPhoneVerificationRequest {
  // E.164. The profile form assembles this from a country code (defaulting to +1) and the rest of
  // the number; the server normalizes whatever it's given and rejects what it can't make sense of.
  phoneNumber: string;
}

export interface StartPhoneVerificationDto {
  // The number as the server normalized it, so the page can say exactly what it texted.
  phoneNumber: string;
  expiresInMinutes: number;
}

// POST /api/players/me/phone/verify — the code from that text. Answers with the updated session
// user, whose phoneNumber is now set.
export interface ConfirmPhoneVerificationRequest {
  code: string;
}

export interface UpdateProfileRequest {
  firstName: string;
  lastName: string;
  // Omitted leaves the rating as it is; null clears it. Ignored for accounts off the ladder,
  // where a rating means nothing.
  ustaRating?: UstaRating | null;
  // Omitted leaves the portrait as it is; null goes back to initials.
  avatarId?: AvatarId | null;
}

// POST /api/auth/complete-profile — what a Google-first signup still owes before it's on the team.
export interface CompleteProfileRequest {
  registrationCode: string;
  ustaRating?: UstaRating | null;
}

// GET /api/auth/providers — which sign-in methods this deployment has configured.
export interface AuthProvidersDto {
  google: boolean;
}

// A place the user travels to matches from. Only ever returned to its owner.
//
// No address: the postal address is geocoded while it's being saved and then discarded, so the
// label is all there is to show. See the UserAddress model in schema.prisma.
export interface UserAddressDto {
  id: string;
  // "Home", "Office", or a label the user typed.
  label: string;
  createdAt: string;
}

// The address is sent once, on the way in, and never stored or returned.
export interface CreateUserAddressRequest {
  label: string;
  address: string;
}

export interface LadderEntryDto {
  userId: string;
  firstName: string;
  lastName: string;
  // Serialized from a Decimal(2,1); null for players who haven't recorded a rating.
  ustaRating: string | null;
  avatarId: AvatarId | null;
  points: number;
  wins: number;
  losses: number;
  ties: number;
}

export interface LocationDto {
  id: string;
  name: string;
  address: string | null;
  // Indoor courts play in any weather, so no forecast is shown for them.
  isIndoor: boolean;
  archivedAt: string | null;
}

// Body of POST /api/admin/locations and PATCH /api/admin/locations/:id.
export interface UpsertLocationRequest {
  name: string;
  // Empty is stored as null — the location simply has no address yet.
  address: string;
  isIndoor: boolean;
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

// One player's own driving plan for a journey to a match — for a match that's already arranged
// (GET /api/matches/:id/travel-plan) or for one being proposed
// (GET /api/travel/departure?addressId=&locationId=&at=). Only ever returned to that player.
//
// ORIGIN_NOT_FOUND / DESTINATION_NOT_FOUND: that address couldn't be placed on the map.
// NO_DESTINATION_ADDRESS: the court has no address recorded.
// NO_ROUTE: both ends were found, but there's no road route between them.
// TOO_FAR: the route is far too long to be a club match, which means an address was placed on the
// wrong continent rather than that anyone is really driving that far.
export type TravelPlanDto =
  | {
      status: "AVAILABLE";
      // The saved address the player said they're coming from.
      origin: UserAddressDto;
      // ISO instant, rounded down to a quarter hour so the rounding always buys time.
      departureTime: string;
      // Driving time the departure was worked back from, in whole minutes. Free-flowing traffic:
      // routing is done without live conditions.
      drivingMinutes: number;
    }
  | {
      status:
        | "ORIGIN_NOT_FOUND"
        | "NO_DESTINATION_ADDRESS"
        | "DESTINATION_NOT_FOUND"
        | "NO_ROUTE"
        | "TOO_FAR";
    };

// The match-scoped endpoint has two more ways to have nothing to say.
// NOT_SCHEDULED: the match isn't arranged yet, so there's no agreed time to arrive by.
// NO_ORIGIN: the player hasn't said which saved address they're coming from.
export type MatchTravelPlanDto = TravelPlanDto | { status: "NOT_SCHEDULED" | "NO_ORIGIN" };

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
  // Where the *requesting* user said they're coming from; null if they haven't said, or aren't
  // one of the players. The other player's choice is never included.
  myTravelOrigin: UserAddressDto | null;
}

// On every request that lets a player state where they're travelling from: omit to leave the
// current choice alone, null to clear it, or the id of one of your own saved addresses.
export interface TravelOriginField {
  travelOriginAddressId?: string | null;
}

export interface ProposeMatchRequest extends TravelOriginField {
  opponentId: string;
  proposedDateTime: string;
  proposedLocationId: string;
  proposedComment?: string;
}

export interface CounterProposeRequest extends TravelOriginField {
  proposedDateTime: string;
  proposedLocationId: string;
  proposedComment?: string;
}

export type AcceptMatchRequest = TravelOriginField;

export interface SetTravelOriginRequest {
  addressId: string | null;
}

export interface SubmitResultRequest {
  outcome: ResultOutcome;
}

// Everything the app holds about one player, as they download it from their profile page.
//
// Shaped to be read by the person it's about rather than by the app: names and places are spelled
// out instead of referenced by id, and `about` explains in plain words what's in the file. Nothing
// here is derived from another player's private data — an opponent appears by the name they'd see
// on the ladder anyway.
export interface PlayerDataExportDto {
  exportedAt: string;
  about: string[];
  account: {
    firstName: string;
    lastName: string;
    email: string;
    ustaRating: string | null;
    phoneNumber: string | null;
    accountType: AccountType;
    onTheLadder: boolean;
    points: number;
    emailVerifiedAt: string | null;
    joinedAt: string;
  };
  // Label and coordinates: the address itself was never stored (see UserAddressDto).
  savedPlaces: {
    label: string;
    latitude: number | null;
    longitude: number | null;
    savedAt: string;
  }[];
  matches: {
    id: string;
    status: MatchStatus;
    opponentName: string;
    iChallenged: boolean;
    proposedFor: string;
    scheduledFor: string | null;
    location: string;
    outcome: "won" | "lost" | "tied" | null;
    pointsAwarded: number | null;
    completedAt: string | null;
  }[];
  // Free text this player typed while arranging matches, which is the only place the app keeps
  // anything they wrote.
  messages: {
    matchId: string;
    type: MatchEventType;
    comment: string;
    writtenAt: string;
  }[];
  pointsAdjustments: {
    previousPoints: number;
    newPoints: number;
    reason: string | null;
    adjustedAt: string;
  }[];
}

// Pushed down `GET /api/live` (server-sent events) whenever something an open page shows has
// changed. Deliberately just a pointer: the page refetches through its normal endpoint, so a
// nudge never carries anything its reader isn't already allowed to fetch.
export type LiveUpdateDto = { type: "match"; matchId: string } | { type: "ladder" };
