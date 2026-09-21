import cron from "node-cron";
import { runMatchReminderJob } from "./matchReminderJob.js";
import { runStaleResultReminderJob } from "./staleResultReminderJob.js";

/**
 * In-process cron, polling every minute. Assumes a single replica (minReplicas=maxReplicas=1)
 * so jobs never double-fire concurrently; each job is additionally idempotent via its own
 * `*SentAt` flag, so even a brief multi-replica window degrades gracefully rather than spamming
 * emails. See docs/architecture.md > Scheduled Jobs for the migration path to Azure Functions
 * Timer Triggers if horizontal scaling is needed later.
 */
export function startScheduler(): void {
  // noOverlap: a tick that runs long (a slow database, a stalled email send) no longer has the
  // next minute's tick start underneath it. The jobs' own *SentAt flags already made a double-fire
  // harmless; this stops it happening in the first place, and node-cron v3 had no way to say so.
  cron.schedule(
    "* * * * *",
    async () => {
      await Promise.all([runMatchReminderJob(), runStaleResultReminderJob()]);
    },
    { name: "match-reminders", noOverlap: true },
  );
}
