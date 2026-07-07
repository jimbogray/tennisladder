export interface MatchConfirmedTemplateInput {
  recipientFirstName: string;
  opponentFirstName: string;
  scheduledDateTime: string;
  locationName: string;
  wonResultUrl: string;
  lostResultUrl: string;
}

export function renderMatchConfirmedEmail(input: MatchConfirmedTemplateInput): { subject: string; html: string } {
  return {
    subject: `Match confirmed vs ${input.opponentFirstName}`,
    html: `<p>Hi ${input.recipientFirstName},</p><p>TODO: confirmation details + "I won" (${input.wonResultUrl}) / "I lost" (${input.lostResultUrl}) links.</p>`,
  };
}
