import { useQuery } from "@tanstack/react-query";
import type { MatchTravelPlanDto } from "@tennisladder/shared";
import { fetchMatchTravelPlan } from "../api/matches.js";
import { fetchDeparturePlan } from "../api/travel.js";
import { formatMatchDateTime, formatTimeOfDay, isCompleteDateTimeLocal } from "../lib/dateTime.js";

const UNAVAILABLE_MESSAGES = {
  NOT_SCHEDULED: "There's no departure time until the match is arranged.",
  NO_ORIGIN:
    "Pick where you're coming from — or save an address on your profile — to see when to leave.",
  ORIGIN_NOT_FOUND: "No departure time: your saved address couldn't be found on the map.",
  NO_DESTINATION_ADDRESS: "No departure time: this location doesn't have an address yet.",
  DESTINATION_NOT_FOUND: "No departure time: this location's address couldn't be found on the map.",
  NO_ROUTE: "No departure time: there's no driving route from your address to this location.",
  TOO_FAR:
    "No departure time: that route is implausibly long, so this location's address is probably being read as somewhere else. An admin can fix it on the Locations page.",
};

function formatDrive(minutes: number): string {
  if (minutes < 60) return `${minutes} min drive`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min drive` : `${hours} hr drive`;
}

/**
 * The departure card itself, shared by a scheduled match and a proposal being drafted.
 *
 * `arriveBy` is the match time the plan was worked back from: it decides whether the departure's
 * date is worth repeating, and whether there's still a journey left to make.
 */
function TravelPlanCard({
  plan,
  isLoading,
  isError,
  arriveBy,
}: {
  plan: MatchTravelPlanDto | undefined;
  isLoading: boolean;
  isError: boolean;
  arriveBy: string;
}) {
  // Once the match has started there's nothing left to leave for, so the nudge would be noise.
  const matchAhead = new Date(arriveBy).getTime() > Date.now();
  const leaveNow =
    plan?.status === "AVAILABLE" &&
    matchAhead &&
    new Date(plan.departureTime).getTime() <= Date.now();

  // The match's own date is on screen right beside this, so repeating it is noise unless the drive
  // starts on an earlier day — which a long enough journey (or a match just after midnight) can do.
  const departureLabel = (departureTime: string) =>
    new Date(departureTime).toDateString() === new Date(arriveBy).toDateString()
      ? formatTimeOfDay(departureTime)
      : formatMatchDateTime(departureTime);

  return (
    <section className="travel-plan" aria-live="polite">
      <div className="travel-plan-heading">
        <span>Getting there</span>
        {plan?.status === "AVAILABLE" ? (
          <span className="travel-plan-drive">{formatDrive(plan.drivingMinutes)}</span>
        ) : null}
      </div>

      {isLoading ? <p className="travel-plan-note">Working out when to leave…</p> : null}
      {isError ? <p className="travel-plan-note">Driving times are unavailable right now.</p> : null}
      {plan && plan.status !== "AVAILABLE" ? (
        <p className="travel-plan-note">{UNAVAILABLE_MESSAGES[plan.status]}</p>
      ) : null}

      {plan?.status === "AVAILABLE" ? (
        <>
          <p className="travel-plan-departure">
            {leaveNow ? "Leave now" : `Leave by ${departureLabel(plan.departureTime)}`}
          </p>
          <p className="travel-plan-note">
            {/* The address itself is beside this: the match's "Coming from" row, or the picker. */}
            From {plan.origin.label}. Driving times don't allow for traffic.
          </p>
        </>
      ) : null}
    </section>
  );
}

/**
 * When the player needs to set off for a scheduled match, and from where.
 *
 * Private to them, like the travel origin it's worked out from: the API only ever answers for the
 * requesting player, and the other player's journey is never shown.
 */
export function TravelPlan({
  matchId,
  scheduledDateTime,
}: {
  matchId: string;
  scheduledDateTime: string;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["match", matchId, "travel-plan"],
    queryFn: () => fetchMatchTravelPlan(matchId),
    // Driving times move slowly, and the match page refetches this whenever the player changes
    // where they're coming from (that invalidation matches the ["match", id] prefix).
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  return (
    <TravelPlanCard plan={data} isLoading={isLoading} isError={isError} arriveBy={scheduledDateTime} />
  );
}

/**
 * The same answer for a match still being drafted, so a player can see what a slot would cost
 * them before offering it — and change the time or the courts while that's still free.
 *
 * Renders nothing until there's something to work from: a location, a complete date and time, and
 * a chosen origin. `dateTime` is the picker's "YYYY-MM-DDTHH:mm" value, which is partial while
 * only a date has been chosen.
 */
export function DeparturePreview({
  addressId,
  locationId,
  dateTime,
}: {
  addressId: string;
  locationId: string;
  dateTime: string;
}) {
  const at = isCompleteDateTimeLocal(dateTime) ? new Date(dateTime).toISOString() : null;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["travel", "departure", addressId, locationId, at],
    // Only ever called with all three in hand; `enabled` keeps it from running otherwise.
    queryFn: () => fetchDeparturePlan({ addressId, locationId, at: at! }),
    enabled: Boolean(addressId) && Boolean(locationId) && at !== null,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  if (!addressId || !locationId || at === null) return null;

  return <TravelPlanCard plan={data} isLoading={isLoading} isError={isError} arriveBy={at} />;
}
