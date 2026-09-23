import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { notifyMatchReminder } from "../services/matchNotifications.js";

/**
 * Sends the "1 hour before match" reminder. Idempotent via reminderSentAt — safe to run every
 * minute and safe against duplicate fires if the API ever scales beyond one replica.
 *
 * The match is only marked as reminded once the emails have gone: stamping first would burn the
 * one reminder a match gets on a send that failed, and the flag is what stops it being retried.
 */
export async function runMatchReminderJob(): Promise<void> {
  const leadWindowEnd = new Date(Date.now() + env.matchReminderLeadMinutes * 60 * 1000);

  const dueMatches = await prisma.match.findMany({
    where: {
      status: "SCHEDULED",
      scheduledDateTime: { lte: leadWindowEnd },
      reminderSentAt: null,
    },
    select: { id: true },
  });

  for (const match of dueMatches) {
    if (!(await notifyMatchReminder(match.id))) continue;

    await prisma.match.update({
      where: { id: match.id },
      data: { reminderSentAt: new Date() },
    });
  }
}
