export interface PasswordResetTemplateInput {
  recipientFirstName: string;
  resetUrl: string;
}

export function renderPasswordResetEmail(input: PasswordResetTemplateInput): { subject: string; html: string } {
  return {
    subject: "Reset your password",
    html: `<p>Hi ${input.recipientFirstName},</p><p>TODO: reset link ${input.resetUrl} (state expiry window).</p>`,
  };
}
