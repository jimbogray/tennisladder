import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";

/**
 * Nudges both players if no result has been recorded N hours after the scheduled match time.
 * Idempotent via staleResultReminderSentAt.
 */
export async function runStaleResultReminderJob(): Promise<void> {
  const staleThreshold = new Date(Date.now() - env.staleResultReminderHours * 60 * 60 * 1000);

  const staleMatches = await prisma.match.findMany({
    where: {
      status: { in: ["SCHEDULED", "RESULT_PENDING"] },
      scheduledDateTime: { lte: staleThreshold },
      staleResultReminderSentAt: null,
    },
    include: { challenger: true, opponent: true },
  });

  for (const match of staleMatches) {
    // TODO: render + send renderResultStaleEmail to both challenger and opponent.
    await prisma.match.update({
      where: { id: match.id },
      data: { staleResultReminderSentAt: new Date() },
    });
  }
}
