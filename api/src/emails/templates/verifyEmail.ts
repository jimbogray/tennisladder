export interface VerifyEmailTemplateInput {
  recipientFirstName: string;
  verifyUrl: string;
}

export function renderVerifyEmailEmail(input: VerifyEmailTemplateInput): { subject: string; html: string } {
  return {
    subject: "Verify your email address",
    html: `<p>Hi ${input.recipientFirstName},</p><p>TODO: verification link ${input.verifyUrl}.</p>`,
  };
}
