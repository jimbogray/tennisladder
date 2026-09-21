import { env } from "../config/env.js";

/**
 * A match time as an email should read it, e.g. "Sat, 12 Oct 2026 at 8:45 PM".
 *
 * Emails are rendered on the server, so there's no viewer locale to defer to the way the SPA does
 * (`web/src/lib/dateTime.ts`) — the zone has to be stated somewhere, and `CLUB_TIMEZONE` is it.
 * Left unset it falls back to UTC, which is correct but reads as an hour or several off to anyone
 * who isn't on it, so a club running this for real should set it.
 */
export function formatMatchDateTimeForEmail(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: env.clubTimeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(value);

  const lookup = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const date = `${lookup("weekday")}, ${lookup("day")} ${lookup("month")} ${lookup("year")}`;
  const time = `${lookup("hour")}:${lookup("minute")} ${lookup("dayPeriod")}`.trim();
  return `${date} at ${time}`;
}
