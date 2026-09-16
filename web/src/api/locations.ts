import type {
  LocationDto,
  LocationForecastDto,
  UpsertLocationRequest,
} from "@tennisladder/shared";
import { apiFetch } from "./client.js";

export function fetchLocations() {
  return apiFetch<LocationDto[]>("/locations");
}

/** Pass `at` (an ISO instant) for the hours around a match; omit it for a daily outlook. */
export function fetchLocationForecast(id: string, at?: string) {
  const query = at ? `?at=${encodeURIComponent(at)}` : "";
  return apiFetch<LocationForecastDto>(`/locations/${id}/forecast${query}`);
}

export function createLocation(body: UpsertLocationRequest) {
  return apiFetch<LocationDto>("/admin/locations", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateLocation(id: string, body: UpsertLocationRequest) {
  return apiFetch<LocationDto>(`/admin/locations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteLocation(id: string) {
  return apiFetch<LocationDto>(`/admin/locations/${id}`, { method: "DELETE" });
}
