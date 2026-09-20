import { useQuery } from "@tanstack/react-query";
import { fetchMatchTravelPlan } from "../api/matches.js";
import { formatMatchDateTime, formatTimeOfDay } from "../lib/dateTime.js";

const UNAVAILABLE_MESSAGES = {
  NOT_SCHEDULED: "There's no departure time until the match is arranged.",
  NO_ORIGIN:
    "Pick where you're coming from — or save an address on your profile — to see when to leave.",
  ORIGIN_NOT_FOUND: "No departure time: your saved address couldn't be found on the map.",
  NO_DESTINATION_ADDRESS: "No departure time: this location doesn't have an address yet.",
  DESTINATION_NOT_FOUND: "No departure time: this location's address couldn't be found on the map.",
  NO_ROUTE: "No departure time: there's no driving route from your address to this location.",
};

function formatDrive(minutes: number): string {
  if (minutes < 60) return `${minutes} min drive`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min drive` : `${hours} hr drive`;
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

  // Once the match has started there's nothing left to leave for, so the nudge would be noise.
  const matchAhead = new Date(scheduledDateTime).getTime() > Date.now();
  const leaveNow =
    data?.status === "AVAILABLE" && matchAhead && new Date(data.departureTime).getTime() <= Date.now();

  // The match's own date is right above this, so repeating it is noise unless the drive starts on
  // an earlier day — which a long enough journey (or a match just after midnight) can do.
  const departureLabel = (departureTime: string) =>
    new Date(departureTime).toDateString() === new Date(scheduledDateTime).toDateString()
      ? formatTimeOfDay(departureTime)
      : formatMatchDateTime(departureTime);

  return (
    <section className="travel-plan" aria-live="polite">
      <div className="travel-plan-heading">
        <span>Getting there</span>
        {data?.status === "AVAILABLE" ? (
          <span className="travel-plan-drive">{formatDrive(data.drivingMinutes)}</span>
        ) : null}
      </div>

      {isLoading ? <p className="travel-plan-note">Working out when to leave…</p> : null}
      {isError ? <p className="travel-plan-note">Driving times are unavailable right now.</p> : null}
      {data && data.status !== "AVAILABLE" ? (
        <p className="travel-plan-note">{UNAVAILABLE_MESSAGES[data.status]}</p>
      ) : null}

      {data?.status === "AVAILABLE" ? (
        <>
          <p className="travel-plan-departure">
            {leaveNow ? "Leave now" : `Leave by ${departureLabel(data.departureTime)}`}
          </p>
          <p className="travel-plan-note">
            {/* The address itself is right above, on the match's "Coming from" row. */}
            From {data.origin.label}. Driving times don't allow for traffic.
          </p>
        </>
      ) : null}
    </section>
  );
}
