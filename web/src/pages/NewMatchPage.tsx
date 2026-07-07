import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchChallengeablePlayers } from "../api/players.js";
import { fetchLocations } from "../api/locations.js";
import { proposeMatch } from "../api/matches.js";
import { OpponentPicker } from "../components/OpponentPicker.js";
import { LocationPicker } from "../components/LocationPicker.js";

export function NewMatchPage() {
  const { data: players } = useQuery({ queryKey: ["players", "challengeable"], queryFn: fetchChallengeablePlayers });
  const { data: locations } = useQuery({ queryKey: ["locations"], queryFn: fetchLocations });

  const [opponentId, setOpponentId] = useState("");
  const [proposedLocationId, setProposedLocationId] = useState("");
  const [proposedDateTime, setProposedDateTime] = useState("");
  const [proposedComment, setProposedComment] = useState("");
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const match = await proposeMatch({
      opponentId,
      proposedDateTime: new Date(proposedDateTime).toISOString(),
      proposedLocationId,
      proposedComment: proposedComment || undefined,
    });
    navigate(`/matches/${match.id}`);
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>Propose a Challenge</h1>
      <OpponentPicker players={players ?? []} value={opponentId} onChange={setOpponentId} />
      <input type="datetime-local" value={proposedDateTime} onChange={(e) => setProposedDateTime(e.target.value)} />
      <LocationPicker locations={locations ?? []} value={proposedLocationId} onChange={setProposedLocationId} />
      <textarea
        placeholder="Optional comment"
        value={proposedComment}
        onChange={(e) => setProposedComment(e.target.value)}
      />
      <button type="submit">Send Challenge</button>
    </form>
  );
}
