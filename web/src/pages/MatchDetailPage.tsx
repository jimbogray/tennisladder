import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { acceptMatch, declineMatch, fetchMatch } from "../api/matches.js";
import { CommentThread } from "../components/CommentThread.js";
import { MatchStatusBadge } from "../components/MatchStatusBadge.js";
import { NegotiationActions } from "../components/NegotiationActions.js";

export function MatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["match", id],
    queryFn: () => fetchMatch(id!),
    enabled: !!id,
  });

  if (isLoading || !data) return <p>Loading…</p>;

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["match", id] });
  }

  return (
    <div>
      <h1>
        Match <MatchStatusBadge status={data.status} />
      </h1>
      {data.status === "NEGOTIATING" ? (
        <NegotiationActions
          onAccept={() => acceptMatch(data.id).then(refresh)}
          onDecline={() => declineMatch(data.id).then(refresh)}
          // TODO: open a counter-propose form/modal instead of a bare action.
          onCounter={() => console.warn("Counter-propose form not implemented yet")}
        />
      ) : null}
      <CommentThread events={data.events} />
    </div>
  );
}
