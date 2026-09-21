import type { AccountType } from "@tennisladder/shared";
import { apiFetch } from "./client.js";

export interface RegistrationCodeDto {
  id: string;
  code: string;
  intendedForNote: string | null;
  invitedEmail: string | null;
  accountType: AccountType;
  usedAt: string | null;
  expiresAt: string;
  createdAt: string;
  isActive: boolean;
}

export function fetchRegistrationCodes() {
  return apiFetch<RegistrationCodeDto[]>("/admin/registration-codes");
}

export function createRegistrationCode(accountType: AccountType, intendedForNote?: string) {
  return apiFetch<RegistrationCodeDto>("/admin/registration-codes", {
    method: "POST",
    body: JSON.stringify({ accountType, intendedForNote }),
  });
}

/** Issues a code and emails the recipient a register link with the code pre-filled. */
export function inviteByEmail(email: string, accountType: AccountType) {
  return apiFetch<RegistrationCodeDto>("/admin/registration-codes/invite", {
    method: "POST",
    body: JSON.stringify({ email, accountType }),
  });
}

export function expireRegistrationCode(id: string) {
  return apiFetch<RegistrationCodeDto>(`/admin/registration-codes/${id}/expire`, {
    method: "POST",
  });
}

export interface TeamMemberDto {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  accountType: AccountType;
  /** Set once they've been taken off the team; such a row is listed only so its data can be erased. */
  removedAt: string | null;
}

/** What the erasure removed, so the page can say what happened rather than just "done". */
export interface ErasureSummaryDto {
  erasedAt: string;
  savedPlacesDeleted: number;
  messagesCleared: number;
  matchesKept: number;
}

export function fetchTeamMembers() {
  return apiFetch<TeamMemberDto[]>("/admin/users");
}

export function updateTeamMemberAccountType(id: string, accountType: AccountType) {
  return apiFetch<TeamMemberDto>(`/admin/users/${id}/account-type`, {
    method: "PATCH",
    body: JSON.stringify({ accountType }),
  });
}

/** Soft-removes a user: they're signed out and hidden, but their past matches are kept. */
export function removeTeamMember(id: string) {
  return apiFetch<void>(`/admin/users/${id}`, { method: "DELETE" });
}

/**
 * Erases a person's personal data for good. Not the same thing as removing them, and not
 * reversible: only call this behind a confirmation the admin has actually read.
 */
export function erasePersonalData(id: string) {
  return apiFetch<ErasureSummaryDto>(`/admin/users/${id}/erase-personal-data`, { method: "POST" });
}
