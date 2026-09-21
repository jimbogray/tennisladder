/**
 * Building the link that puts a match in a player's calendar.
 *
 * Google Calendar's event template URL is the whole mechanism: it opens a prefilled "new event"
 * for whoever is signed in, who then saves it themselves. No Google account has to be connected to
 * the ladder and no calendar API is called, so this works from the SPA and from an email alike —
 * which is why it lives here rather than in either workspace.
 */

/**
 * How long a match blocks out. The ladder doesn't record a duration — matches finish when they
 * finish — so a calendar entry has to assume one, and an hour and a half is a normal club singles
 * match: long enough that the slot doesn't look free, short enough not to swallow an evening.
 */
export const MATCH_CALENDAR_DURATION_MINUTES = 90;

export interface MatchCalendarInput {
  challengerName: string;
  opponentName: string;
  /** When the match was actually agreed for — a proposal isn't a calendar entry. */
  scheduledDateTime: string | Date;
  locationName: string;
  locationAddress?: string | null;
  /** The match's page on the site, linked from the event so it leads back to the negotiation. */
  matchUrl?: string;
}

/**
 * A UTC instant in the basic format the `dates` parameter takes, e.g. `20261012T204500Z`.
 *
 * Deliberately UTC rather than a zoned time: Google reads the trailing Z and shows the event in
 * whatever zone the player's own calendar is set to. So unlike the times written into emails, this
 * needs no `CLUB_TIMEZONE` to come out right.
 */
function toCalendarTimestamp(value: Date): string {
  return `${value.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
}

/** The "add this match" link for Google Calendar. */
export function googleCalendarUrlForMatch(input: MatchCalendarInput): string {
  const start = new Date(input.scheduledDateTime);
  const end = new Date(start.getTime() + MATCH_CALENDAR_DURATION_MINUTES * 60_000);

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Tennis ladder: ${input.challengerName} vs ${input.opponentName}`,
    dates: `${toCalendarTimestamp(start)}/${toCalendarTimestamp(end)}`,
    location: input.locationAddress
      ? `${input.locationName}, ${input.locationAddress}`
      : input.locationName,
  });
  if (input.matchUrl) {
    params.set("details", `Match details and result reporting: ${input.matchUrl}`);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
