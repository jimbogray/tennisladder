import { escapeHtml } from "../escapeHtml.js";
import { renderMatchThread, type MatchThreadEntry } from "../matchThread.js";

export interface ChallengeProposedTemplateInput {
  recipientFirstName: string;
  challengerFirstName: string;
  proposedDateTime: string;
  locationName: string;
  /** The negotiation so far — just the opening proposal on a brand-new challenge. */
  commentThread: MatchThreadEntry[];
  matchUrl: string;
}

export function renderChallengeProposedEmail(input: ChallengeProposedTemplateInput): { subject: string; html: string } {
  return {
    subject: `${input.challengerFirstName} has challenged you to a match`,
    html: `
      <p>Hi ${escapeHtml(input.recipientFirstName)},</p>
      <p>
        ${escapeHtml(input.challengerFirstName)} has challenged you, and suggested
        ${escapeHtml(input.proposedDateTime)} at ${escapeHtml(input.locationName)}.
      </p>
      ${renderMatchThread(input.commentThread)}
      <p><a href="${escapeHtml(input.matchUrl)}">Accept, suggest another time, or decline</a></p>
      <p>It's your turn — ${escapeHtml(input.challengerFirstName)} is waiting on your reply.</p>
    `.trim(),
  };
}
