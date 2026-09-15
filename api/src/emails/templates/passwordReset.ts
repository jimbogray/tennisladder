import { escapeHtml } from "../escapeHtml.js";

export interface PasswordResetTemplateInput {
  recipientFirstName: string;
  resetUrl: string;
  expiresInMinutes: number;
}

export function renderPasswordResetEmail(input: PasswordResetTemplateInput): { subject: string; html: string } {
  return {
    subject: "Reset your tennis ladder password",
    html: `
      <p>Hi ${escapeHtml(input.recipientFirstName)},</p>
      <p>Someone asked to reset the password for your tennis ladder account.</p>
      <p><a href="${escapeHtml(input.resetUrl)}">Choose a new password</a></p>
      <p>
        This link expires in ${input.expiresInMinutes} minutes and can only be used once. Setting a
        new password signs you out everywhere else.
      </p>
      <p>If you didn't ask for this, ignore this email — your password won't change.</p>
    `.trim(),
  };
}
