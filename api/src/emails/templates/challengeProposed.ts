import type { MatchEventDto } from "@tennisladder/shared";

export interface ChallengeProposedTemplateInput {
  recipientFirstName: string;
  challengerFirstName: string;
  proposedDateTime: string;
  locationName: string;
  commentThread: MatchEventDto[];
  matchUrl: string;
}

// TODO: render commentThread chronologically into the email body — same thread shown on-site
// (see docs/architecture.md > Match State Machine: MatchEvent table is the comment/negotiation thread).
export function renderChallengeProposedEmail(input: ChallengeProposedTemplateInput): { subject: string; html: string } {
  return {
    subject: `${input.challengerFirstName} has challenged you to a match`,
    html: `<p>Hi ${input.recipientFirstName},</p><p>TODO: render proposal + comment thread + link to ${input.matchUrl}</p>`,
  };
}
