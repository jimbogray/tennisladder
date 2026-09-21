/**
 * Putting a match in a player's calendar, two ways.
 *
 * Google Calendar's event template URL opens a prefilled "new event" for whoever is signed in, who
 * then saves it themselves; the iCalendar file covers every other calendar (Apple, Outlook, and
 * anything else that opens a .ics). Neither asks the player to connect an account to the ladder and
 * neither calls a calendar API, so both work from the SPA and from an email alike — which is why
 * they live here rather than in either workspace.
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
  /** The Match row's id, which becomes the event's UID. See `matchCalendarIcs`. */
  matchId?: string;
}

/**
 * A UTC instant in the basic format both the `dates` parameter and iCalendar's DATE-TIME take,
 * e.g. `20261012T204500Z`.
 *
 * Deliberately UTC rather than a zoned time: a calendar reads the trailing Z and shows the event in
 * whatever zone its owner is on. So unlike the times written into emails, this needs no
 * `CLUB_TIMEZONE` to come out right, and it needs no VTIMEZONE component in the .ics.
 */
function toCalendarTimestamp(value: Date): string {
  return `${value.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
}

function eventTitle(input: MatchCalendarInput): string {
  return `Tennis ladder: ${input.challengerName} vs ${input.opponentName}`;
}

function eventLocation(input: MatchCalendarInput): string {
  return input.locationAddress
    ? `${input.locationName}, ${input.locationAddress}`
    : input.locationName;
}

function eventDescription(input: MatchCalendarInput): string | undefined {
  return input.matchUrl ? `Match details and result reporting: ${input.matchUrl}` : undefined;
}

function matchTimes(input: MatchCalendarInput): { start: Date; end: Date } {
  const start = new Date(input.scheduledDateTime);
  return { start, end: new Date(start.getTime() + MATCH_CALENDAR_DURATION_MINUTES * 60_000) };
}

/** The "add this match" link for Google Calendar. */
export function googleCalendarUrlForMatch(input: MatchCalendarInput): string {
  const { start, end } = matchTimes(input);

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: eventTitle(input),
    dates: `${toCalendarTimestamp(start)}/${toCalendarTimestamp(end)}`,
    location: eventLocation(input),
  });
  const description = eventDescription(input);
  if (description) params.set("details", description);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Escaping for an iCalendar TEXT value (RFC 5545 §3.3.11): backslash, semicolon and comma are
 * delimiters in the format itself, and a newline has to be written as the two characters `\n`.
 * A club with a name like "Smith, Jones & Co" would otherwise split one field into two.
 */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Folds a content line to the 75-octet limit (RFC 5545 §3.1), continuing with a leading space.
 * Counted in UTF-8 bytes, not characters, so an accented name in a location doesn't push a line
 * over the limit unnoticed — and a multi-byte character is never split across the fold.
 */
function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const folded: string[] = [];
  let current = "";
  let currentBytes = 0;
  // A continuation line starts with a space, which counts toward its own 75 octets.
  let limit = 75;
  for (const char of line) {
    const charBytes = encoder.encode(char).length;
    if (currentBytes + charBytes > limit) {
      folded.push(current);
      current = "";
      currentBytes = 0;
      limit = 74;
    }
    current += char;
    currentBytes += charBytes;
  }
  folded.push(current);
  return folded.join("\r\n ");
}

/**
 * The match as an iCalendar file, for the calendars Google's link doesn't reach.
 *
 * `matchId` becomes the event's UID, so a player who downloads the file twice updates the one
 * event instead of collecting duplicates. Without it the UID falls back to the start time and the
 * players' names, which is stable for the same match but would collide with a rematch at the same
 * hour — pass the id wherever it's to hand.
 *
 * `now` is the DTSTAMP, i.e. when this file was written; it defaults to the current time and is a
 * parameter only so the output can be asserted on.
 */
export function matchCalendarIcs(input: MatchCalendarInput, now: Date = new Date()): string {
  const { start, end } = matchTimes(input);
  const uid = input.matchId ?? `${toCalendarTimestamp(start)}-${input.challengerName}-${input.opponentName}`;
  const description = eventDescription(input);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Playmore Tennis//Tennis Ladder//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(uid)}@playmore.tennis`,
    `DTSTAMP:${toCalendarTimestamp(now)}`,
    `DTSTART:${toCalendarTimestamp(start)}`,
    `DTEND:${toCalendarTimestamp(end)}`,
    `SUMMARY:${escapeIcsText(eventTitle(input))}`,
    `LOCATION:${escapeIcsText(eventLocation(input))}`,
    ...(description ? [`DESCRIPTION:${escapeIcsText(description)}`] : []),
    ...(input.matchUrl ? [`URL:${escapeIcsText(input.matchUrl)}`] : []),
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  // CRLF throughout, including a trailing one: RFC 5545 defines a file as a sequence of lines,
  // and some desktop clients reject one that doesn't end in a line break.
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

/** What the downloaded file should be called, e.g. `alice-adams-vs-bob-obrien.ics`. */
export function matchCalendarFileName(input: MatchCalendarInput): string {
  const slug = (name: string) =>
    name
      .toLowerCase()
      .normalize("NFD")
      // Strip accents, then apostrophes (so O'Brien reads as obrien, not o-brien), then anything
      // else that isn't a letter or a digit.
      .replace(/[̀-ͯ]/g, "")
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  const names = [slug(input.challengerName), slug(input.opponentName)].filter(Boolean);
  return names.length === 2 ? `${names[0]}-vs-${names[1]}.ics` : "tennis-match.ics";
}
