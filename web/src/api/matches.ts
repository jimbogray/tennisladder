import type {
  CounterProposeRequest,
  MatchDetailDto,
  MatchDto,
  MatchScope,
  MatchStatusFilter,
  ProposeMatchRequest,
  SubmitResultRequest,
} from "@tennisladder/shared";
import { apiFetch } from "./client.js";

export function fetchMatches(scope: MatchScope, status: MatchStatusFilter | null) {
  const params = new URLSearchParams({ scope });
  if (status) params.set("status", status);
  return apiFetch<MatchDto[]>(`/matches?${params}`);
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

/** Revise your own still-unanswered offer. The turn stays with the other player. */
export function amendProposal(id: string, body: CounterProposeRequest) {
  return apiFetch<MatchDto>(`/matches/${id}/amend`, { method: "POST", body: JSON.stringify(body) });
}

export function counterPropose(id: string, body: CounterProposeRequest) {
  return apiFetch<MatchDto>(`/matches/${id}/counter`, { method: "POST", body: JSON.stringify(body) });
}

/** Challenger pulls their own challenge before it's agreed. */
export function withdrawMatch(id: string, comment?: string) {
  return apiFetch<MatchDto>(`/matches/${id}/withdraw`, {
    method: "POST",
    body: JSON.stringify({ comment }),
  });
}

export function cancelMatch(id: string, comment?: string) {
  return apiFetch<MatchDto>(`/matches/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify({ comment }),
  });
}

export function acceptMatch(id: string) {
  return apiFetch<MatchDto>(`/matches/${id}/accept`, { method: "POST" });
}

export function declineMatch(id: string) {
  return apiFetch<MatchDto>(`/matches/${id}/decline`, { method: "POST" });
}

/** Report the score for a played match; the other player then confirms or rejects it. */
export function proposeResult(id: string, body: SubmitResultRequest) {
  return apiFetch<MatchDto>(`/matches/${id}/result`, { method: "POST", body: JSON.stringify(body) });
}

/** Reporter corrects their own score before it's been answered. */
export function amendResult(id: string, body: SubmitResultRequest) {
  return apiFetch<MatchDto>(`/matches/${id}/result/amend`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function confirmResult(id: string) {
  return apiFetch<MatchDto>(`/matches/${id}/result/confirm`, { method: "POST" });
}

export function rejectResult(id: string, comment?: string) {
  return apiFetch<MatchDto>(`/matches/${id}/result/reject`, {
    method: "POST",
    body: JSON.stringify({ comment }),
  });
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
