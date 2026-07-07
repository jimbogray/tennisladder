import type {
  CounterProposeRequest,
  MatchDetailDto,
  MatchDto,
  MatchFilter,
  ProposeMatchRequest,
  SubmitResultRequest,
} from "@tennisladder/shared";
import { apiFetch } from "./client.js";

export function fetchMatches(filter: MatchFilter = "all") {
  return apiFetch<MatchDto[]>(`/matches?filter=${filter}`);
}

export function fetchMyMatches() {
  return apiFetch<MatchDto[]>("/matches/mine");
}

export function fetchMatch(id: string) {
  return apiFetch<MatchDetailDto>(`/matches/${id}`);
}

export function proposeMatch(body: ProposeMatchRequest) {
  return apiFetch<MatchDto>("/matches", { method: "POST", body: JSON.stringify(body) });
}

export function counterPropose(id: string, body: CounterProposeRequest) {
  return apiFetch<MatchDto>(`/matches/${id}/counter`, { method: "POST", body: JSON.stringify(body) });
}

export function acceptMatch(id: string) {
  return apiFetch<MatchDto>(`/matches/${id}/accept`, { method: "POST" });
}

export function declineMatch(id: string) {
  return apiFetch<MatchDto>(`/matches/${id}/decline`, { method: "POST" });
}

export function submitResult(id: string, body: SubmitResultRequest) {
  return apiFetch<MatchDto>(`/matches/${id}/result`, { method: "POST", body: JSON.stringify(body) });
}

export function fetchAdminPendingMatches() {
  return apiFetch<MatchDto[]>("/admin/matches/pending");
}

export function adminOverrideResult(id: string, winnerId: string, loserId: string) {
  return apiFetch<MatchDto>(`/admin/matches/${id}/override-result`, {
    method: "POST",
    body: JSON.stringify({ winnerId, loserId }),
  });
}
