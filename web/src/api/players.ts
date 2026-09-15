import type {
  LadderEntryDto,
  PublicUserDto,
  SessionUserDto,
  UpdateProfileRequest,
} from "@tennisladder/shared";
import { apiFetch } from "./client.js";

export function updateMyProfile(body: UpdateProfileRequest) {
  return apiFetch<SessionUserDto>("/players/me", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

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
