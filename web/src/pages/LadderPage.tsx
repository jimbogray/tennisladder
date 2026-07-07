import { useQuery } from "@tanstack/react-query";
import { fetchLadder } from "../api/players.js";
import { LadderTable } from "../components/LadderTable.js";

export function LadderPage() {
  const { data, isLoading } = useQuery({ queryKey: ["ladder"], queryFn: fetchLadder });

  if (isLoading || !data) return <p>Loading…</p>;
  return (
    <div>
      <h1>Ladder</h1>
      <LadderTable entries={data} />
    </div>
  );
}
