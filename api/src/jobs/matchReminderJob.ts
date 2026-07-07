import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";

/**
 * Sends the "1 hour before match" reminder. Idempotent via reminderSentAt — safe to run every
 * minute and safe against duplicate fires if the API ever scales beyond one replica.
 */
export async function runMatchReminderJob(): Promise<void> {
  const leadWindowEnd = new Date(Date.now() + env.matchReminderLeadMinutes * 60 * 1000);

  const dueMatches = await prisma.match.findMany({
    where: {
      status: "SCHEDULED",
      scheduledDateTime: { lte: leadWindowEnd },
      reminderSentAt: null,
    },
    include: { challenger: true, opponent: true, proposedLocation: true },
  });

  for (const match of dueMatches) {
    // TODO: render + send renderMatchReminderEmail to both challenger and opponent.
    await prisma.match.update({
      where: { id: match.id },
      data: { reminderSentAt: new Date() },
    });
  }
}
