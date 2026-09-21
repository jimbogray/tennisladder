import type {
  ConfirmPhoneVerificationRequest,
  LadderEntryDto,
  PublicUserDto,
  SessionUserDto,
  StartPhoneVerificationDto,
  StartPhoneVerificationRequest,
  UpdateProfileRequest,
} from "@tennisladder/shared";
import { apiFetch } from "./client.js";

export function updateMyProfile(body: UpdateProfileRequest) {
  return apiFetch<SessionUserDto>("/players/me", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/** Texts a confirmation code to the number being registered for notifications. */
export function startPhoneVerification(body: StartPhoneVerificationRequest) {
  return apiFetch<StartPhoneVerificationDto>("/players/me/phone", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Confirms that code, which is what actually attaches the number to the account. */
export function confirmPhoneVerification(body: ConfirmPhoneVerificationRequest) {
  return apiFetch<SessionUserDto>("/players/me/phone/verify", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function removePhoneNumber() {
  return apiFetch<SessionUserDto>("/players/me/phone", { method: "DELETE" });
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
