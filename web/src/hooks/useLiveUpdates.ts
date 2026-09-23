import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { LiveUpdateDto } from "@tennisladder/shared";
import { readLiveUpdates } from "../api/live.js";
import { refreshSession } from "../api/auth.js";
import { ApiError, setAccessToken } from "../api/client.js";
import { useAuth } from "./useAuth.js";

const MAX_RETRY_DELAY_MS = 30_000;

/** Resolves after `ms`, or straight away once `signal` aborts. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

// invalidateQueries only refetches queries a mounted page is using, so these cost nothing for
// pages that aren't open.
function refreshMatch(queryClient: QueryClient, matchId: string) {
  // The prefix takes in the match's travel plan too, since a new time means a new departure.
  void queryClient.invalidateQueries({ queryKey: ["match", matchId] });
  void queryClient.invalidateQueries({ queryKey: ["matches"] });
  void queryClient.invalidateQueries({ queryKey: ["admin", "matches"] });
}

function refreshLadder(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ["ladder"] });
  void queryClient.invalidateQueries({ queryKey: ["players"] });
}

/** For after a gap in the stream, when whatever changed during it went unannounced. */
function refreshEverything(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ["match"] });
  void queryClient.invalidateQueries({ queryKey: ["matches"] });
  void queryClient.invalidateQueries({ queryKey: ["admin", "matches"] });
  refreshLadder(queryClient);
}

function applyUpdate(queryClient: QueryClient, update: LiveUpdateDto) {
  if (update.type === "match") refreshMatch(queryClient, update.matchId);
  else if (update.type === "ladder") refreshLadder(queryClient);
}

/**
 * Keeps the open page current while other people act: listens on `GET /api/live` and refetches
 * whatever the page shows when the server says it changed. Mounted once, by the signed-in layout.
 *
 * The server ends the stream when the access token it was opened with expires. A reconnect that's
 * refused with a 401 mints a new token from the refresh cookie and tries again; one that fails for
 * any other reason backs off, up to 30 seconds between tries.
 */
export function useLiveUpdates(): void {
  const queryClient = useQueryClient();
  const { updateUser } = useAuth();

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    async function listen() {
      let failures = 0;
      let hasConnected = false;
      let justRefreshed = false;

      while (!signal.aborted) {
        try {
          await readLiveUpdates(
            signal,
            () => {
              failures = 0;
              justRefreshed = false;
              if (hasConnected) refreshEverything(queryClient);
              hasConnected = true;
            },
            (update) => applyUpdate(queryClient, update),
          );
          // The server ended it (the token's lifetime ran out): reconnect, after a beat so a
          // proxy that cuts every stream at once can't turn this into a tight loop.
          await wait(1_000, signal);
        } catch (err) {
          if (signal.aborted) return;

          if (err instanceof ApiError && err.status === 401 && !justRefreshed) {
            try {
              const session = await refreshSession();
              setAccessToken(session.accessToken);
              updateUser(session.user);
              justRefreshed = true;
              continue;
            } catch {
              // Signed out elsewhere, or removed: there's nothing left to listen for.
              return;
            }
          }

          // A 401 straight after a fresh token isn't retried at once, but gets another refresh
          // once the back-off has passed.
          justRefreshed = false;
          failures += 1;
          await wait(Math.min(MAX_RETRY_DELAY_MS, 1_000 * 2 ** failures), signal);
        }
      }
    }

    void listen();
    return () => controller.abort();
  }, [queryClient, updateUser]);
}
