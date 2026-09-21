import { SmsClient } from "@azure/communication-sms";
import { env } from "../config/env.js";

export interface SendSmsInput {
  /** E.164, e.g. +15551234567. */
  to: string;
  message: string;
}

/**
 * SMS rides on the same Azure Communication Services resource as the email, but needs a sender
 * number provisioned on it as well as the connection string — so it can be off while email is on,
 * and a deployment that only ever sends email doesn't have to buy a number.
 */
const client =
  env.azureCommunicationConnectionString && env.smsFromNumber
    ? new SmsClient(env.azureCommunicationConnectionString)
    : undefined;

/** Whether this deployment can actually send a text, as opposed to logging one. */
export function isSmsConfigured(): boolean {
  return client !== undefined;
}

/**
 * Unlike {@link sendEmail}, a failure here throws: the only thing SMS carries is a confirmation
 * code, and the user is sitting in front of the page waiting for it, so a silent failure would
 * leave them staring at a box no code is ever going to fill.
 */
export async function sendSms({ to, message }: SendSmsInput): Promise<void> {
  if (!client) {
    if (env.logUnsentMessages) {
      // The same escape hatch unsent emails use: print what would have gone out so the flow can
      // still be completed. Staging runs this way deliberately and has no SMS number.
      console.info(`[smsService] SMS not configured; not sending to ${to}: ${message}`);
    } else {
      console.warn(`[smsService] SMS_FROM_NUMBER not set; skipping send to ${to}`);
    }
    return;
  }

  const [result] = await client.send({ from: env.smsFromNumber, to: [to], message });
  if (!result?.successful) {
    throw new Error(
      `SMS send to ${to} failed: ${result?.httpStatusCode ?? "no status"} ${result?.errorMessage ?? ""}`.trim(),
    );
  }
}
