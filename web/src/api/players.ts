import type { LadderEntryDto, PublicUserDto } from "@tennisladder/shared";
import { apiFetch } from "./client.js";

export function fetchLadder() {
  return apiFetch<LadderEntryDto[]>("/players");
}

export function fetchChallengeablePlayers() {
  return apiFetch<PublicUserDto[]>("/players/challengeable");
}

export function adjustPlayerPoints(userId: string, newPoints: number, reason?: string) {
  return apiFetch<PublicUserDto>(`/admin/players/${userId}/points`, {
    method: "PATCH",
    body: JSON.stringify({ newPoints, reason }),
  });
}
