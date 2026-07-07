import { EmailClient } from "@azure/communication-email";
import { env } from "../config/env.js";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

const client = env.azureCommunicationConnectionString
  ? new EmailClient(env.azureCommunicationConnectionString)
  : undefined;

/**
 * All negotiation/reminder/result emails are sent "from" this single masked address so
 * players' real email addresses are never exposed to each other.
 */
export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<void> {
  if (!client) {
    console.warn(`[emailService] AZURE_COMMUNICATION_CONNECTION_STRING not set; skipping send to ${to}`);
    return;
  }

  const poller = await client.beginSend({
    senderAddress: env.emailFromAddress,
    content: { subject, html },
    recipients: { to: [{ address: to }] },
  });
  await poller.pollUntilDone();
}
