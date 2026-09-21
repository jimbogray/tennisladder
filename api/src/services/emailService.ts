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
    if (env.logUnsentMessages) {
      const links = extractLinks(html);
      console.info(
        `[emailService] email not configured; not sending "${subject}" to ${to}` +
          (links.length ? `. Links:\n  ${links.join("\n  ")}` : " (no links)"),
      );
    } else {
      console.warn(`[emailService] AZURE_COMMUNICATION_CONNECTION_STRING not set; skipping send to ${to}`);
    }
    return;
  }

  const poller = await client.beginSend({
    senderAddress: env.emailFromAddress,
    content: { subject, html },
    recipients: { to: [{ address: to }] },
  });
  await poller.pollUntilDone();
}

/**
 * Pulls every URL out of an email body, whether it sits in an href or in plain text (some templates
 * are still placeholders that print URLs inline), undoing the HTML escaping templates apply.
 */
function extractLinks(html: string): string[] {
  const urls = (html.match(/https?:\/\/[^\s"'<>()]+/g) ?? []).map((url) =>
    url.replace(/&amp;/g, "&").replace(/[.,;:]+$/, ""),
  );
  return [...new Set(urls)];
}
