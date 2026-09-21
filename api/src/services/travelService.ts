import { MatchStatus, type Location } from "@prisma/client";
import type { MatchTravelPlanDto, TravelPlanDto } from "@tennisladder/shared";
import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import { toUserAddressDto } from "./addressService.js";
import { geocodeLocation, type Coordinates } from "./geocodingService.js";
import { getJson } from "./upstream.js";

/**
 * When a player has to leave to reach a match on time — one that's arranged, or one they're
 * still proposing.
 *
 * Driving times come from OSRM (the public demo server by default, overridable with
 * ROUTING_BASE_URL), which is free and keyless like the rest of the third-party data here. OSRM
 * routes on free-flowing road speeds with no live traffic, so the number is a floor rather than a
 * promise — rounding the departure *down* to a quarter hour is what buys back a few minutes.
 */

const DEPARTURE_STEP_MS = 15 * 60 * 1000;
/**
 * Past this, the answer is treated as nonsense rather than reported. A club ladder's matches are
 * local, so a drive this long means an address was geocoded onto the wrong continent — a location
 * addressed "Flushing Meadows" resolves to a housing development of that name in Bangalore.
 */
const MAX_PLAUSIBLE_DRIVE_SECONDS = 8 * 60 * 60;
// Distances and road speeds don't change; only traffic does, and OSRM doesn't model it anyway.
const ROUTE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const ROUTE_TIMEOUT_MS = 8000;

interface OsrmRouteResponse {
  // "Ok" when a route was found, "NoRoute" when the two ends aren't connected by road.
  code: string;
  routes?: { duration: number }[];
}

const routeCache = new Map<string, { expiresAt: number; seconds: number | null }>();

/** Seconds of driving between two points, or null when there's no road route. */
async function drivingSeconds(from: Coordinates, to: Coordinates): Promise<number | null> {
  // ~11m of precision: enough to tell two courts apart, coarse enough to reuse the same journey.
  const key = [from.latitude, from.longitude, to.latitude, to.longitude]
    .map((value) => value.toFixed(4))
    .join(",");
  const now = Date.now();
  const cached = routeCache.get(key);
  if (cached && cached.expiresAt > now) return cached.seconds;

  // OSRM takes coordinates as lon,lat — the opposite order to everywhere else here. The base URL
  // is joined as a prefix rather than a URL base, so a server hosted under a path still works.
  const base = env.routingBaseUrl.replace(/\/+$/, "");
  const url = new URL(
    `${base}/route/v1/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}`,
  );
  // Just the duration: no geometry, no turn-by-turn steps, no alternative routes.
  url.searchParams.set("overview", "false");
  url.searchParams.set("alternatives", "false");
  url.searchParams.set("steps", "false");

  const data = (await getJson(url, ROUTE_TIMEOUT_MS)) as OsrmRouteResponse;
  const seconds = data.code === "Ok" ? (data.routes?.[0]?.duration ?? null) : null;

  for (const [cachedKey, entry] of routeCache) {
    if (entry.expiresAt <= now) routeCache.delete(cachedKey);
  }
  routeCache.set(key, { expiresAt: now + ROUTE_CACHE_TTL_MS, seconds });
  return seconds;
}

/**
 * The latest quarter hour a player can set off and still arrive before the match starts.
 *
 * Rounding down is deliberate: the leftover minutes are slack against traffic the router didn't
 * see. Flooring the instant itself lands on a local quarter hour too — every timezone offset in
 * use is a whole number of quarter hours, the same reasoning the 15-minute match grid relies on.
 */
function departureTime(startsAt: Date, seconds: number): Date {
  const latest = startsAt.getTime() - seconds * 1000;
  return new Date(Math.floor(latest / DEPARTURE_STEP_MS) * DEPARTURE_STEP_MS);
}

/** A saved address as this module needs it: a label to report back, and where it is. */
interface TravelOrigin {
  id: string;
  label: string;
  createdAt: Date;
  latitude: number | null;
  longitude: number | null;
}

/**
 * The shared core: route between the two ends and work back from the arrival time. Callers have
 * already decided *which* address and location, and that the caller may see them. Both rows must
 * carry their coordinate columns, which are omitted by default (prisma.ts).
 */
async function planJourney(
  address: TravelOrigin,
  location: Location,
  arriveBy: Date,
): Promise<TravelPlanDto> {
  if (!location.address) return { status: "NO_DESTINATION_ADDRESS" };

  // The origin was geocoded when the player saved it, and its address wasn't kept, so there is
  // nothing to look up here. Coordinates are missing only on a row saved before that change.
  if (address.latitude === null || address.longitude === null) {
    return { status: "ORIGIN_NOT_FOUND" };
  }
  const from = { latitude: address.latitude, longitude: address.longitude };

  const to = await geocodeLocation(location);
  if (to.status !== "FOUND") return { status: "DESTINATION_NOT_FOUND" };

  const seconds = await drivingSeconds(from, to.coordinates);
  if (seconds === null) return { status: "NO_ROUTE" };
  if (seconds > MAX_PLAUSIBLE_DRIVE_SECONDS) return { status: "TOO_FAR" };

  return {
    status: "AVAILABLE",
    origin: toUserAddressDto(address),
    departureTime: departureTime(arriveBy, seconds).toISOString(),
    drivingMinutes: Math.round(seconds / 60),
  };
}

// A location opts back into its geocoding cache columns, omitted globally (prisma.ts).
const withGeocodingCache = { omit: { latitude: false, longitude: false, geocodedAddress: false } } as const;
// A saved address only has coordinates left to opt back into.
const withCoordinates = { omit: { latitude: false, longitude: false } } as const;

/**
 * The requesting player's own journey to a match: where they said they're coming from, and when
 * to leave. Null when there's no such match or the requester isn't one of its two players — the
 * other player's origin is private, and so is their departure time.
 */
export async function getMatchTravelPlan(
  matchId: string,
  userId: string,
): Promise<MatchTravelPlanDto | null> {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) return null;
  if (match.challengerId !== userId && match.opponentId !== userId) return null;
  // Only an agreed time is worth planning a journey around; a proposal on this page can still
  // move, and the one being drafted on a proposal form goes through getDeparturePlan instead.
  if (match.status !== MatchStatus.SCHEDULED || !match.scheduledDateTime) {
    return { status: "NOT_SCHEDULED" };
  }

  const travelOrigin = await prisma.matchTravelOrigin.findUnique({
    where: { matchId_userId: { matchId, userId } },
  });
  if (!travelOrigin) return { status: "NO_ORIGIN" };

  const [address, location] = await Promise.all([
    prisma.userAddress.findUnique({ where: { id: travelOrigin.addressId }, ...withCoordinates }),
    prisma.location.findUnique({ where: { id: match.proposedLocationId }, ...withGeocodingCache }),
  ]);
  // Neither is expected to be missing: deleting an address cascades to the choice pointing at it,
  // and a match always references a location. Both are answered as if they simply had no address.
  if (!address) return { status: "NO_ORIGIN" };
  if (!location) return { status: "NO_DESTINATION_ADDRESS" };

  return planJourney(address, location, match.scheduledDateTime);
}

/**
 * The same journey for a match that doesn't exist yet: a location and time being proposed, from
 * one of the caller's own saved addresses. Null when that address isn't theirs (or the location
 * is unknown), which the route answers as a 404 rather than naming someone else's address.
 */
export async function getDeparturePlan(input: {
  userId: string;
  addressId: string;
  locationId: string;
  arriveBy: Date;
}): Promise<TravelPlanDto | null> {
  const [address, location] = await Promise.all([
    // Scoped to the caller, so nobody can plan a journey from (or probe for) someone else's address.
    prisma.userAddress.findFirst({
      where: { id: input.addressId, userId: input.userId },
      ...withCoordinates,
    }),
    prisma.location.findUnique({ where: { id: input.locationId }, ...withGeocodingCache }),
  ]);
  if (!address || !location) return null;

  return planJourney(address, location, input.arriveBy);
}
