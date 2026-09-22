import type {
  AuthProvidersDto,
  AvatarId,
  CompleteProfileRequest,
  CreateUserAddressRequest,
  SessionUserDto,
} from "@tennisladder/shared";
import { API_BASE_URL, apiFetch } from "./client.js";

/**
 * Google sign-in is a full-page navigation, not a fetch: the browser has to visit Google and be
 * redirected back to the API, which hands the session over as the refresh cookie.
 */
export const googleSignInUrl = `${API_BASE_URL}/auth/google`;

export function fetchAuthProviders() {
  return apiFetch<AuthProvidersDto>("/auth/providers");
}

export function completeProfile(body: CompleteProfileRequest) {
  return apiFetch<{ user: SessionUserDto; accessToken: string }>("/auth/complete-profile", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

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
  // "" is the initials badge, the same value the profile form sends.
  avatarId?: AvatarId | "";
  registrationCode: string;
  addresses?: CreateUserAddressRequest[];
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

export function refreshSession() {
  return apiFetch<{ user: SessionUserDto; accessToken: string }>("/auth/refresh", {
    method: "POST",
  });
}

export function logout() {
  return apiFetch<void>("/auth/logout", { method: "POST" });
}

export function requestPasswordReset(email: string) {
  return apiFetch<{ expiresInMinutes: number }>("/auth/request-password-reset", {
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
