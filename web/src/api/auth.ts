import type { SessionUserDto } from "@tennisladder/shared";
import { apiFetch } from "./client.js";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  ustaRating?: string;
  registrationCode: string;
}

export function login(body: LoginRequest) {
  return apiFetch<{ user: SessionUserDto; accessToken: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function register(body: RegisterRequest) {
  return apiFetch<{ user: SessionUserDto; accessToken: string }>("/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function fetchSession() {
  return apiFetch<{ user: SessionUserDto | null }>("/auth/session");
}

export function logout() {
  return apiFetch<void>("/auth/logout", { method: "POST" });
}

export function requestPasswordReset(email: string) {
  return apiFetch<void>("/auth/request-password-reset", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(token: string, password: string) {
  return apiFetch<void>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, password }),
  });
}
