import type { TravelPlanDto } from "@tennisladder/shared";
import { apiFetch } from "./client.js";

/**
 * When you'd need to leave for a match that isn't arranged yet — a location, a time being
 * proposed, and one of your own saved addresses. Private: the address has to be yours.
 */
export function fetchDeparturePlan(params: { addressId: string; locationId: string; at: string }) {
  const query = new URLSearchParams(params);
  return apiFetch<TravelPlanDto>(`/travel/departure?${query}`);
}
