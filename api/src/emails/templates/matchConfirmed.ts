import { escapeHtml } from "../escapeHtml.js";

export interface MatchConfirmedTemplateInput {
  recipientFirstName: string;
  opponentFirstName: string;
  scheduledDateTime: string;
  locationName: string;
  calendarUrl: string;
  wonResultUrl: string;
  lostResultUrl: string;
}

export function renderMatchConfirmedEmail(input: MatchConfirmedTemplateInput): { subject: string; html: string } {
  return {
    subject: `Match confirmed vs ${input.opponentFirstName}`,
    html: `
      <p>Hi ${escapeHtml(input.recipientFirstName)},</p>
      <p>
        You're playing ${escapeHtml(input.opponentFirstName)} on
        ${escapeHtml(input.scheduledDateTime)} at ${escapeHtml(input.locationName)}.
      </p>
      <p>
        <a href="${escapeHtml(input.calendarUrl)}">Add this match to your Google Calendar</a>
      </p>
      <p>Once you've played, tell us how it went:</p>
      <p>
        <a href="${escapeHtml(input.wonResultUrl)}">I won</a>
        &nbsp;or&nbsp;
        <a href="${escapeHtml(input.lostResultUrl)}">I lost</a>
      </p>
      <p>
        Whoever reports first, the other player is asked to agree before the ladder moves. These
        links are yours alone, and they stop working once the match is settled.
      </p>
    `.trim(),
  };
}
