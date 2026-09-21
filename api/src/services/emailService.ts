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

if (env.emailRedirectTo) {
  console.warn(
    `[emailService] EMAIL_REDIRECT_TO is set — every email goes to ${env.emailRedirectTo}, ` +
      "whoever it was addressed to. This must never be set on production.",
  );
}

/**
 * All negotiation/reminder/result emails are sent "from" this single masked address so
 * players' real email addresses are never exposed to each other.
 *
 * This is also the one place every email passes through, which is why the dev/staging redirect
 * lives here rather than at each call site: a notification added later is covered without anyone
 * remembering to.
 */
export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<void> {
  const delivery = applyRedirect(to, subject);
  const describeRecipient = delivery.redirected
    ? `${delivery.to} (addressed to ${to})`
    : delivery.to;

  if (!client) {
    if (env.logUnsentMessages) {
      const links = extractLinks(html);
      console.info(
        `[emailService] email not configured; not sending "${delivery.subject}" to ${describeRecipient}` +
          (links.length ? `. Links:\n  ${links.join("\n  ")}` : " (no links)"),
      );
    } else {
      console.warn(
        `[emailService] AZURE_COMMUNICATION_CONNECTION_STRING not set; skipping send to ${describeRecipient}`,
      );
    }
    return;
  }

  const poller = await client.beginSend({
    senderAddress: env.emailFromAddress,
    content: { subject: delivery.subject, html },
    recipients: { to: [{ address: delivery.to }] },
  });
  await poller.pollUntilDone();
}

/**
 * Sends an email to the tester instead of the player it was addressed to, when EMAIL_REDIRECT_TO
 * is configured, and names the intended recipient at the front of the subject — the only way to
 * tell which player an email was for once several players' notifications share one inbox, and it
 * matters here because a result email's links are that player's alone.
 *
 * The body is left exactly as rendered. Its links already resolve against this environment's own
 * site and database (they're built from WEB_APP_URL), so they open the same pages and settle the
 * same tokens they would in production — rewriting them to point elsewhere would only produce
 * links whose tokens don't exist at the other end.
 *
 * An email already bound for the redirect address is left alone: it isn't being diverted, so there
 * is nothing to say about where it would have gone.
 */
function applyRedirect(
  to: string,
  subject: string,
): { to: string; subject: string; redirected: boolean } {
  const redirectTo = env.emailRedirectTo;
  if (!redirectTo || redirectTo.toLowerCase() === to.trim().toLowerCase()) {
    return { to, subject, redirected: false };
  }
  return { to: redirectTo, subject: `[to: ${to}] ${subject}`, redirected: true };
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
