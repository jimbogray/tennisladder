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
