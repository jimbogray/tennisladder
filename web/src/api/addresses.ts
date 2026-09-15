import type {
  CreateUserAddressRequest,
  SetTravelOriginRequest,
  UserAddressDto,
} from "@tennisladder/shared";
import { apiFetch } from "./client.js";

export function fetchMyAddresses() {
  return apiFetch<UserAddressDto[]>("/players/me/addresses");
}

export function createAddress(body: CreateUserAddressRequest) {
  return apiFetch<UserAddressDto>("/players/me/addresses", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function deleteAddress(id: string) {
  return apiFetch<void>(`/players/me/addresses/${id}`, { method: "DELETE" });
}

/** Where you're coming from for a match. Private: the other player never sees it. */
export function setTravelOrigin(matchId: string, body: SetTravelOriginRequest) {
  return apiFetch<{ myTravelOrigin: UserAddressDto | null }>(`/matches/${matchId}/travel-origin`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}
