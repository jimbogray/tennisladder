import { escapeHtml } from "./escapeHtml.js";

/**
 * One line of a match's negotiation history, already resolved to the words an email should show.
 *
 * `MatchEvent` is the negotiation thread (docs/architecture.md > Match State Machine), rendered
 * both on the match page and here, so a player answering from their inbox sees the same
 * conversation they would on the site. The rows are turned into this shape by the notification
 * service, which is where the ids in a `MatchEvent` can be resolved to names and locations.
 */
export interface MatchThreadEntry {
  /** Who acted. Null for anything the ladder itself did. */
  actorFirstName: string | null;
  /** What they did, as a verb phrase: "proposed", "suggested instead", "called it off". */
  action: string;
  /** The date/time this event put on the table, already formatted; null if it carried none. */
  proposedDateTime: string | null;
  locationName: string | null;
  comment: string | null;
}

/**
 * The thread as email-safe HTML. Returns an empty string for an empty thread so a template can
 * concatenate it unconditionally.
 *
 * Deliberately plain: nested tables and floated layouts are what break in Outlook, and a
 * paragraph per entry reads the same everywhere.
 */
export function renderMatchThread(entries: MatchThreadEntry[]): string {
  if (entries.length === 0) return "";

  const lines = entries.map((entry) => {
    const who = entry.actorFirstName ? `<strong>${escapeHtml(entry.actorFirstName)}</strong>` : "The ladder";
    const what = [
      `${who} ${escapeHtml(entry.action)}`,
      entry.proposedDateTime ? ` ${escapeHtml(entry.proposedDateTime)}` : "",
      entry.locationName ? ` at ${escapeHtml(entry.locationName)}` : "",
    ].join("");
    const comment = entry.comment
      ? `<br /><em>&ldquo;${escapeHtml(entry.comment)}&rdquo;</em>`
      : "";
    return `<p style="margin:0 0 8px 0">${what}.${comment}</p>`;
  });

  return `<div style="border-left:3px solid #d8e6d2;padding-left:12px;margin:16px 0">${lines.join("")}</div>`;
}
