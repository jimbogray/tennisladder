import type { LocationDto } from "@tennisladder/shared";
import { apiFetch } from "./client.js";

export function fetchLocations() {
  return apiFetch<LocationDto[]>("/locations");
}

export function createLocation(name: string) {
  return apiFetch<LocationDto>("/admin/locations", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function updateLocation(id: string, name: string) {
  return apiFetch<LocationDto>(`/admin/locations/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export function deleteLocation(id: string) {
  return apiFetch<LocationDto>(`/admin/locations/${id}`, { method: "DELETE" });
}
