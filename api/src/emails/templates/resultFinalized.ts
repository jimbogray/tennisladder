export interface ResultFinalizedTemplateInput {
  recipientFirstName: string;
  opponentFirstName: string;
  didWin: boolean;
  pointsAwarded: number | null;
}

export function renderResultFinalizedEmail(input: ResultFinalizedTemplateInput): { subject: string; html: string } {
  return {
    subject: `Result finalized: vs ${input.opponentFirstName}`,
    html: `<p>Hi ${input.recipientFirstName},</p><p>TODO: outcome + points summary.</p>`,
  };
}
