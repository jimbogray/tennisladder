import { escapeHtml } from "../escapeHtml.js";

export interface MatchReminderTemplateInput {
  recipientFirstName: string;
  opponentFirstName: string;
  scheduledDateTime: string;
  locationName: string;
  locationAddress: string | null;
  matchUrl: string;
  leadMinutes: number;
}

export function renderMatchReminderEmail(input: MatchReminderTemplateInput): { subject: string; html: string } {
  const hours = Math.round(input.leadMinutes / 60);
  const lead =
    input.leadMinutes >= 60
      ? `${hours} ${hours === 1 ? "hour" : "hours"}`
      : `${input.leadMinutes} minutes`;

  return {
    subject: `Reminder: your match vs ${input.opponentFirstName} is in ${lead}`,
    html: `
      <p>Hi ${escapeHtml(input.recipientFirstName)},</p>
      <p>
        You're playing ${escapeHtml(input.opponentFirstName)} at
        ${escapeHtml(input.scheduledDateTime)}, at ${escapeHtml(input.locationName)}${
          input.locationAddress ? ` (${escapeHtml(input.locationAddress)})` : ""
        }.
      </p>
      <p><a href="${escapeHtml(input.matchUrl)}">See the match</a></p>
      <p>Can't make it? Call it off from the match page so your opponent isn't left waiting.</p>
    `.trim(),
  };
}
