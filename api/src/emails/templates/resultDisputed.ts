import { escapeHtml } from "../escapeHtml.js";

export interface ResultDisputedTemplateInput {
  recipientFirstName: string;
  otherPlayerFirstName: string;
  comment: string | null;
  matchUrl: string;
}

/**
 * To whoever reported the score, when the other player disagrees. The admins aren't emailed: a
 * dispute surfaces on their dashboard, which is where they act on it
 * (docs/architecture.md > Open questions).
 */
export function renderResultDisputedEmail(input: ResultDisputedTemplateInput): { subject: string; html: string } {
  return {
    subject: `${input.otherPlayerFirstName} disagrees with the score you recorded`,
    html: `
      <p>Hi ${escapeHtml(input.recipientFirstName)},</p>
      <p>
        ${escapeHtml(input.otherPlayerFirstName)} says your match didn't go the way you recorded it.
      </p>
      ${input.comment ? `<p><em>&ldquo;${escapeHtml(input.comment)}&rdquo;</em></p>` : ""}
      <p><a href="${escapeHtml(input.matchUrl)}">See the match</a></p>
      <p>
        An admin will settle it and set the result. Nobody's points change in the meantime, and
        there's nothing else you need to do.
      </p>
    `.trim(),
  };
}
