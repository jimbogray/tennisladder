import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  googleCalendarUrlForMatch,
  matchCalendarFileName,
  matchCalendarIcs,
  MATCH_CALENDAR_DURATION_MINUTES,
  type MatchCalendarInput,
} from "@tennisladder/shared";

// Pure functions over a plain object, so unlike the rest of the suite these touch no database.

const MATCH: MatchCalendarInput = {
  challengerName: "Alice Adams",
  opponentName: "Bob O'Brien",
  scheduledDateTime: "2026-10-12T20:45:00.000Z",
  locationName: "Riverside Courts",
  locationAddress: "12 River Rd, Springfield, NJ",
  matchUrl: "https://www.playmore.tennis/matches/abc123",
  matchId: "abc123",
};

const WROTE_AT = new Date("2026-09-21T09:30:00.000Z");

/**
 * The fields of an unfolded .ics, as `{ SUMMARY: "…" }`. BEGIN and END appear twice (the calendar
 * and the event), so the last of each wins — assert on those against the raw text instead.
 */
function icsFields(ics: string): Record<string, string> {
  // Undo RFC 5545 line folding: a CRLF followed by a single space continues the line before it.
  const unfolded = ics.replace(/\r\n /g, "");
  return Object.fromEntries(
    unfolded
      .split("\r\n")
      .filter(Boolean)
      .map((line) => {
        const colon = line.indexOf(":");
        return [line.slice(0, colon), line.slice(colon + 1)];
      }),
  );
}

describe("the Google Calendar link", () => {
  it("prefills a 90-minute event at the match's own instant", () => {
    const params = new URL(googleCalendarUrlForMatch(MATCH)).searchParams;

    assert.equal(params.get("action"), "TEMPLATE");
    assert.equal(params.get("text"), "Tennis ladder: Alice Adams vs Bob O'Brien");
    assert.equal(params.get("dates"), "20261012T204500Z/20261012T221500Z");
    assert.equal(MATCH_CALENDAR_DURATION_MINUTES, 90);
  });

  it("writes the time as UTC, so no club timezone has to be configured for it to be right", () => {
    const dates = new URL(googleCalendarUrlForMatch(MATCH)).searchParams.get("dates");

    // Both halves end in Z; a calendar shows the instant in its own owner's zone.
    assert.match(dates!, /^\d{8}T\d{6}Z\/\d{8}T\d{6}Z$/);
  });

  it("puts the address after the location's name, and copes with a location that has none", () => {
    const withAddress = new URL(googleCalendarUrlForMatch(MATCH)).searchParams;
    assert.equal(withAddress.get("location"), "Riverside Courts, 12 River Rd, Springfield, NJ");

    const without = new URL(
      googleCalendarUrlForMatch({ ...MATCH, locationAddress: null }),
    ).searchParams;
    assert.equal(without.get("location"), "Riverside Courts");
  });

  it("links back to the match, and omits the description when there's nowhere to link", () => {
    const linked = new URL(googleCalendarUrlForMatch(MATCH)).searchParams;
    assert.match(linked.get("details")!, /https:\/\/www\.playmore\.tennis\/matches\/abc123$/);

    const unlinked = new URL(
      googleCalendarUrlForMatch({ ...MATCH, matchUrl: undefined }),
    ).searchParams;
    assert.equal(unlinked.get("details"), null);
  });
});

describe("the .ics file", () => {
  it("describes the match as one confirmed 90-minute event", () => {
    const ics = matchCalendarIcs(MATCH, WROTE_AT);
    const fields = icsFields(ics);

    assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
    assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
    assert.equal(ics.split("BEGIN:VEVENT\r\n").length - 1, 1);
    assert.equal(fields.VERSION, "2.0");
    assert.equal(fields.SUMMARY, "Tennis ladder: Alice Adams vs Bob O'Brien");
    assert.equal(fields.DTSTART, "20261012T204500Z");
    assert.equal(fields.DTEND, "20261012T221500Z");
    assert.equal(fields.DTSTAMP, "20260921T093000Z");
    assert.equal(fields.STATUS, "CONFIRMED");
    assert.equal(fields.URL, "https://www.playmore.tennis/matches/abc123");
  });

  it("identifies the event by the match id, so a second download updates it rather than adding one", () => {
    assert.equal(icsFields(matchCalendarIcs(MATCH, WROTE_AT)).UID, "abc123@playmore.tennis");

    // Without an id the UID still has to be stable for the same match…
    const anonymous = { ...MATCH, matchId: undefined };
    assert.equal(
      icsFields(matchCalendarIcs(anonymous, WROTE_AT)).UID,
      icsFields(matchCalendarIcs(anonymous, new Date("2027-01-01T00:00:00.000Z"))).UID,
    );
    // …and different for a different match.
    assert.notEqual(
      icsFields(matchCalendarIcs(anonymous, WROTE_AT)).UID,
      icsFields(matchCalendarIcs({ ...anonymous, opponentName: "Cara Coach" }, WROTE_AT)).UID,
    );
  });

  it("escapes the delimiters of the format itself out of a location's name", () => {
    const ics = matchCalendarIcs(
      { ...MATCH, locationName: "Smith, Jones & Co; Courts", locationAddress: null },
      WROTE_AT,
    );

    // Written escaped in the file…
    assert.match(ics, /LOCATION:Smith\\, Jones & Co\\; Courts/);
    // …and still one field when the file is read back, rather than three values.
    assert.equal(icsFields(ics).LOCATION, "Smith\\, Jones & Co\\; Courts");
  });

  it("folds long lines to 75 octets, counting UTF-8 bytes and never splitting a character", () => {
    const ics = matchCalendarIcs(
      { ...MATCH, challengerName: "Renée Dupont-Smith-Fitzwilliam-Cholmondeley-Featherstonehaugh" },
      WROTE_AT,
    );

    for (const line of ics.split("\r\n")) {
      assert.ok(
        Buffer.byteLength(line, "utf8") <= 75,
        `line over the 75-octet limit: ${JSON.stringify(line)}`,
      );
    }
    // Unfolding puts the name back together, accent and all.
    assert.equal(
      icsFields(ics).SUMMARY,
      "Tennis ladder: Renée Dupont-Smith-Fitzwilliam-Cholmondeley-Featherstonehaugh vs Bob O'Brien",
    );
  });

  it("uses CRLF line endings throughout, including the last line", () => {
    const ics = matchCalendarIcs(MATCH, WROTE_AT);

    assert.ok(ics.endsWith("\r\n"), "the file has to end in a line break");
    assert.equal(ics.includes("\n\n"), false);
    // No bare LF anywhere: every newline is part of a CRLF pair.
    assert.equal(ics.replace(/\r\n/g, "").includes("\n"), false);
  });
});

describe("the .ics filename", () => {
  it("names both players, without punctuation or accents", () => {
    assert.equal(matchCalendarFileName(MATCH), "alice-adams-vs-bob-obrien.ics");
    assert.equal(
      matchCalendarFileName({ ...MATCH, challengerName: "Renée Dupont-Smith" }),
      "renee-dupont-smith-vs-bob-obrien.ics",
    );
  });

  it("falls back to a generic name rather than an empty one", () => {
    assert.equal(matchCalendarFileName({ ...MATCH, challengerName: "…" }), "tennis-match.ics");
  });
});
