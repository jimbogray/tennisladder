export interface InviteTemplateInput {
  registerUrl: string;
  code: string;
  expiresAt: Date;
}

export function renderInviteEmail(input: InviteTemplateInput): { subject: string; html: string } {
  const expires = input.expiresAt.toUTCString();

  return {
    subject: "You're invited to join the tennis ladder",
    html: `
      <p>Hi,</p>
      <p>You've been invited to join the club tennis ladder.</p>
      <p><a href="${input.registerUrl}">Create your account</a></p>
      <p>
        That link fills in your registration code automatically. If you'd rather type it in,
        your code is <strong>${input.code}</strong>.
      </p>
      <p>This invite expires on ${expires} and can only be used once.</p>
    `.trim(),
  };
}
