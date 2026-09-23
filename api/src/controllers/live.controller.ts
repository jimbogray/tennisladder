import type { Request, Response } from "express";
import { env } from "../config/env.js";
import { subscribe } from "../services/liveUpdates.js";

// Well inside the idle timeouts of the Container Apps ingress and of browsers and proxies in
// between, which would otherwise close a quiet stream.
const HEARTBEAT_MS = 25_000;

/**
 * `GET /api/live`: a server-sent event stream of LiveUpdateDto frames for as long as the page is
 * open. The SPA reads it with fetch rather than EventSource, because EventSource can't send the
 * bearer token.
 *
 * Authenticated once, when it opens, so it is closed again when that access token would have
 * expired. The client reconnects with a fresh token, and a removed user's stream ends with the
 * token they already held.
 */
export function streamLiveUpdates(_req: Request, res: Response): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Stops any buffering proxy from holding frames back until the response ends.
    "X-Accel-Buffering": "no",
  });
  // Sends the headers now, so the client knows it's connected before anything happens.
  res.write(": connected\n\n");

  const unsubscribe = subscribe(res);
  const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);
  const expiry = setTimeout(() => res.end(), env.jwtAccessTtlMinutes * 60_000);

  res.on("close", () => {
    clearInterval(heartbeat);
    clearTimeout(expiry);
    unsubscribe();
  });
}
