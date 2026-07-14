import { apiFetch } from "./client.js";

export interface RegistrationCodeDto {
  id: string;
  code: string;
  intendedForNote: string | null;
  usedAt: string | null;
  expiresAt: string;
  createdAt: string;
  isActive: boolean;
}

export function fetchRegistrationCodes() {
  return apiFetch<RegistrationCodeDto[]>("/admin/registration-codes");
}

export function createRegistrationCode(intendedForNote?: string) {
  return apiFetch<RegistrationCodeDto>("/admin/registration-codes", {
    method: "POST",
    body: JSON.stringify({ intendedForNote }),
  });
}

export function expireRegistrationCode(id: string) {
  return apiFetch<RegistrationCodeDto>(`/admin/registration-codes/${id}/expire`, {
    method: "POST",
  });
}
