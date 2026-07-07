import type { ResultOutcome } from "@tennisladder/shared";
import { apiFetch } from "./client.js";

export function resolveResultToken(token: string) {
  return apiFetch<{ matchId: string; outcome: ResultOutcome }>(`/results/token/${token}`);
}

export function submitResultViaToken(token: string) {
  return apiFetch<void>(`/results/token/${token}`, { method: "POST" });
}
