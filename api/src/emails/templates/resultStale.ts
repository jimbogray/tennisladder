import { escapeHtml } from "../escapeHtml.js";

export interface ResultStaleTemplateInput {
  recipientFirstName: string;
  opponentFirstName: string;
  scheduledDateTime: string;
  matchUrl: string;
}

export function renderResultStaleEmail(input: ResultStaleTemplateInput): { subject: string; html: string } {
  return {
    subject: `Please record the result of your match vs ${input.opponentFirstName}`,
    html: `
      <p>Hi ${escapeHtml(input.recipientFirstName)},</p>
      <p>
        Your match with ${escapeHtml(input.opponentFirstName)} on
        ${escapeHtml(input.scheduledDateTime)} still has no result, so the ladder hasn't moved.
      </p>
      <p><a href="${escapeHtml(input.matchUrl)}">Record how it went</a></p>
      <p>
        Whoever reports first, the other player is asked to agree. If you didn't end up playing,
        call the match off from the same page.
      </p>
    `.trim(),
  };
}
