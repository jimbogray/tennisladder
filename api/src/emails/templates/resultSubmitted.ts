import { escapeHtml } from "../escapeHtml.js";

export interface ResultSubmittedTemplateInput {
  recipientFirstName: string;
  otherPlayerFirstName: string;
  /** What the other player said happened, from the recipient's point of view. */
  recipientWon: boolean;
  isTie: boolean;
  /** True when they're correcting a score they'd already reported. */
  amended: boolean;
  matchUrl: string;
}

export function renderResultSubmittedEmail(input: ResultSubmittedTemplateInput): { subject: string; html: string } {
  const other = escapeHtml(input.otherPlayerFirstName);
  const claim = input.isTie
    ? `${other} has recorded your match as a draw.`
    : input.recipientWon
      ? `${other} has recorded your match as a win for you.`
      : `${other} has recorded your match as a win for them.`;

  return {
    subject: input.amended
      ? `${input.otherPlayerFirstName} changed the score of your match`
      : `${input.otherPlayerFirstName} recorded the result of your match`,
    html: `
      <p>Hi ${escapeHtml(input.recipientFirstName)},</p>
      <p>${input.amended ? `${other} has corrected the score. ` : ""}${claim}</p>
      <p><a href="${escapeHtml(input.matchUrl)}">Agree, or say it went differently</a></p>
      <p>
        Nothing moves on the ladder until you answer. If you say it went differently, an admin
        settles it.
      </p>
    `.trim(),
  };
}
