export interface ResultStaleTemplateInput {
  recipientFirstName: string;
  opponentFirstName: string;
  matchUrl: string;
}

export function renderResultStaleEmail(input: ResultStaleTemplateInput): { subject: string; html: string } {
  return {
    subject: `Please record the result of your match vs ${input.opponentFirstName}`,
    html: `<p>Hi ${input.recipientFirstName},</p><p>TODO: nudge to log result at ${input.matchUrl}.</p>`,
  };
}
