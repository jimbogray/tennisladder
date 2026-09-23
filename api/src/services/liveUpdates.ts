import type { LiveUpdateDto } from "@tennisladder/shared";

/** The one thing a live connection needs: somewhere to write a server-sent event frame. */
export interface LiveSubscriber {
  write(chunk: string): unknown;
}

/**
 * Every open `GET /api/live` stream on this process.
 *
 * In memory, which relies on the same single always-on replica as the scheduler and the rate
 * limiters: with a second replica, a change made on one would only reach pages connected to that
 * one. Move to a shared channel (Postgres LISTEN/NOTIFY is the obvious one) before scaling out.
 */
const subscribers = new Set<LiveSubscriber>();

/** Returns the unsubscribe function, for when the connection closes. */
export function subscribe(subscriber: LiveSubscriber): () => void {
  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
  };
}

function publish(update: LiveUpdateDto): void {
  const frame = `data: ${JSON.stringify(update)}\n\n`;
  for (const subscriber of subscribers) {
    // One broken socket mustn't stop the others hearing about it; its close handler unsubscribes it.
    try {
      subscriber.write(frame);
    } catch {
      subscribers.delete(subscriber);
    }
  }
}

/**
 * Broadcast to everyone signed in, not just the two players: the match lists show every match to
 * every member, and the frame carries only the id.
 *
 * Call only after the change has committed, or a page that refetches straight away reads the old
 * state and keeps it.
 */
export function publishMatchChanged(matchId: string): void {
  publish({ type: "match", matchId });
}

/** Points, a result, or who is on the ladder and how they appear on it. */
export function publishLadderChanged(): void {
  publish({ type: "ladder" });
}
