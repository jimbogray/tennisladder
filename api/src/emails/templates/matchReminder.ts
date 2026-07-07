export interface MatchReminderTemplateInput {
  recipientFirstName: string;
  opponentFirstName: string;
  scheduledDateTime: string;
  locationName: string;
}

export function renderMatchReminderEmail(input: MatchReminderTemplateInput): { subject: string; html: string } {
  return {
    subject: `Reminder: your match vs ${input.opponentFirstName} is in 1 hour`,
    html: `<p>Hi ${input.recipientFirstName},</p><p>TODO: reminder details.</p>`,
  };
}
