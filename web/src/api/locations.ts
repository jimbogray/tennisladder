import type { LocationDto, LocationForecastDto } from "@tennisladder/shared";
import { apiFetch } from "./client.js";

export function fetchLocations() {
  return apiFetch<LocationDto[]>("/locations");
}

/** Pass `at` (an ISO instant) for the hours around a match; omit it for a daily outlook. */
export function fetchLocationForecast(id: string, at?: string) {
  const query = at ? `?at=${encodeURIComponent(at)}` : "";
  return apiFetch<LocationForecastDto>(`/locations/${id}/forecast${query}`);
}

export function createLocation(name: string, address: string) {
  return apiFetch<LocationDto>("/admin/locations", {
    method: "POST",
    body: JSON.stringify({ name, address }),
  });
}

export function updateLocation(id: string, name: string, address: string) {
  return apiFetch<LocationDto>(`/admin/locations/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name, address }),
  });
}

export function deleteLocation(id: string) {
  return apiFetch<LocationDto>(`/admin/locations/${id}`, { method: "DELETE" });
}
