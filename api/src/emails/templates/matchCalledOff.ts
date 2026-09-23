import { escapeHtml } from "../escapeHtml.js";

/**
 * Why a match isn't happening. All four end the match, and all four are worth an email, but they
 * read very differently to whoever gets one: a decline answers a challenge, a withdrawal takes one
 * back, a cancellation calls off something already in the diary, and an admin cancellation is a
 * third party stepping in.
 */
export type CalledOffReason = "DECLINED" | "WITHDRAWN" | "CANCELLED" | "ADMIN_CANCELLED";

export interface MatchCalledOffTemplateInput {
  recipientFirstName: string;
  otherPlayerFirstName: string;
  reason: CalledOffReason;
  /** The time it was set for, formatted. Null while it was still being negotiated. */
  scheduledDateTime: string | null;
  comment: string | null;
  ladderUrl: string;
}

export function renderMatchCalledOffEmail(input: MatchCalledOffTemplateInput): { subject: string; html: string } {
  const other = escapeHtml(input.otherPlayerFirstName);
  const when = input.scheduledDateTime ? ` on ${escapeHtml(input.scheduledDateTime)}` : "";

  const { subject, body } = {
    DECLINED: {
      subject: `${input.otherPlayerFirstName} declined your challenge`,
      body: `${other} has declined your challenge. Nothing more to do — challenge them again another time, or pick someone else on the ladder.`,
    },
    WITHDRAWN: {
      subject: `${input.otherPlayerFirstName} withdrew their challenge`,
      body: `${other} has withdrawn their challenge, so there's nothing for you to answer.`,
    },
    CANCELLED: {
      subject: `Your match with ${input.otherPlayerFirstName} is off`,
      body: `${other} has called off your match${when}.`,
    },
    ADMIN_CANCELLED: {
      subject: `Your match with ${input.otherPlayerFirstName} was cancelled`,
      body: `An admin has cancelled your match with ${other}${when}.`,
    },
  }[input.reason];

  return {
    subject,
    html: `
      <p>Hi ${escapeHtml(input.recipientFirstName)},</p>
      <p>${body}</p>
      ${input.comment ? `<p><em>&ldquo;${escapeHtml(input.comment)}&rdquo;</em></p>` : ""}
      <p><a href="${escapeHtml(input.ladderUrl)}">See the ladder</a></p>
      <p>Nobody's points have changed.</p>
    `.trim(),
  };
}
