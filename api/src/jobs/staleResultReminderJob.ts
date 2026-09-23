import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { notifyResultStale } from "../services/matchNotifications.js";

/**
 * Nudges both players if no result has been recorded N hours after the scheduled match time.
 * Idempotent via staleResultReminderSentAt, and — as with the match reminder — only stamped once
 * the emails have actually gone, so a failed send is retried on the next run rather than silently
 * using up the single nudge.
 */
export async function runStaleResultReminderJob(): Promise<void> {
  const staleThreshold = new Date(Date.now() - env.staleResultReminderHours * 60 * 60 * 1000);

  const staleMatches = await prisma.match.findMany({
    where: {
      status: { in: ["SCHEDULED", "RESULT_PENDING"] },
      scheduledDateTime: { lte: staleThreshold },
      staleResultReminderSentAt: null,
    },
    select: { id: true },
  });

  for (const match of staleMatches) {
    if (!(await notifyResultStale(match.id))) continue;

    await prisma.match.update({
      where: { id: match.id },
      data: { staleResultReminderSentAt: new Date() },
    });
  }
}
