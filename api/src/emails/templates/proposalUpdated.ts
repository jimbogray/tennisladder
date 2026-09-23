import { escapeHtml } from "../escapeHtml.js";
import { renderMatchThread, type MatchThreadEntry } from "../matchThread.js";

/**
 * Which side moved. A counter-proposal is an answer that hands the turn back; an amendment is the
 * proposing side revising an offer before it's been answered. Either way the recipient is the one
 * who now owes a reply — only the wording differs.
 */
export type ProposalChange = "AMENDED" | "COUNTER_PROPOSED";

export interface ProposalUpdatedTemplateInput {
  recipientFirstName: string;
  otherPlayerFirstName: string;
  change: ProposalChange;
  proposedDateTime: string;
  locationName: string;
  commentThread: MatchThreadEntry[];
  matchUrl: string;
}

export function renderProposalUpdatedEmail(input: ProposalUpdatedTemplateInput): { subject: string; html: string } {
  const countered = input.change === "COUNTER_PROPOSED";
  const subject = countered
    ? `${input.otherPlayerFirstName} suggested a different time`
    : `${input.otherPlayerFirstName} changed their proposal`;
  const opening = countered
    ? `${escapeHtml(input.otherPlayerFirstName)} has answered with a different time.`
    : `${escapeHtml(input.otherPlayerFirstName)} has changed the time they proposed.`;

  return {
    subject,
    html: `
      <p>Hi ${escapeHtml(input.recipientFirstName)},</p>
      <p>
        ${opening} It now stands at ${escapeHtml(input.proposedDateTime)} at
        ${escapeHtml(input.locationName)}.
      </p>
      ${renderMatchThread(input.commentThread)}
      <p><a href="${escapeHtml(input.matchUrl)}">Accept, suggest another time, or decline</a></p>
      <p>It's your turn — ${escapeHtml(input.otherPlayerFirstName)} is waiting on your reply.</p>
    `.trim(),
  };
}
