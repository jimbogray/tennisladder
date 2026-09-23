import type { LiveUpdateDto } from "@tennisladder/shared";
import { apiRequest } from "./client.js";

/**
 * Reads `GET /api/live` until the server ends it, calling `onOpen` once it's connected and
 * `onUpdate` for every frame. With fetch rather than EventSource, because EventSource can't send
 * the bearer token. Rejects with ApiError if the stream is refused, or when `signal` aborts.
 */
export async function readLiveUpdates(
  signal: AbortSignal,
  onOpen: () => void,
  onUpdate: (update: LiveUpdateDto) => void,
): Promise<void> {
  const res = await apiRequest("/live", { signal, headers: { Accept: "text/event-stream" } });
  onOpen();
  if (!res.body) return;

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffered = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffered += value;

    // Frames end with a blank line and can arrive split across reads, or several to a read.
    let end: number;
    while ((end = buffered.indexOf("\n\n")) !== -1) {
      const frame = buffered.slice(0, end);
      buffered = buffered.slice(end + 2);
      // Lines starting ":" are the server's heartbeats; only "data:" lines carry an update.
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        try {
          onUpdate(JSON.parse(line.slice("data:".length)) as LiveUpdateDto);
        } catch {
          // A frame this build doesn't understand is skipped, not fatal.
        }
      }
    }
  }
}
