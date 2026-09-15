import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchChallengeablePlayers } from "../api/players.js";
import { fetchLocations } from "../api/locations.js";
import { proposeMatch } from "../api/matches.js";
import { OpponentPicker } from "../components/OpponentPicker.js";
import { LocationPicker } from "../components/LocationPicker.js";
import { ApiError } from "../api/client.js";
import { MatchDateTimePicker } from "../components/MatchDateTimePicker.js";
import { WeatherForecast } from "../components/WeatherForecast.js";

export function NewMatchPage() {
  const { data: players } = useQuery({ queryKey: ["players", "challengeable"], queryFn: fetchChallengeablePlayers });
  const { data: locations } = useQuery({ queryKey: ["locations"], queryFn: fetchLocations });

  // The ladder's challenge action links here as /matches/new?opponentId=… to preselect an opponent.
  const [searchParams] = useSearchParams();
  const [opponentId, setOpponentId] = useState(searchParams.get("opponentId") ?? "");
  const [proposedLocationId, setProposedLocationId] = useState("");
  const [proposedDateTime, setProposedDateTime] = useState("");
  const [proposedComment, setProposedComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const match = await proposeMatch({
        opponentId,
        proposedDateTime: new Date(proposedDateTime).toISOString(),
        proposedLocationId,
        proposedComment: proposedComment || undefined,
      });
      navigate(`/matches/${match.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send the challenge. Please try again.");
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>Propose a Challenge</h1>
      {error && <p role="alert">{error}</p>}
      <OpponentPicker players={players ?? []} value={opponentId} onChange={setOpponentId} />
      <MatchDateTimePicker
        id="proposed-datetime"
        value={proposedDateTime}
        onChange={setProposedDateTime}
      />
      <LocationPicker locations={locations ?? []} value={proposedLocationId} onChange={setProposedLocationId} />
      <WeatherForecast locationId={proposedLocationId} dateTime={proposedDateTime} />
      <textarea
        placeholder="Optional comment"
        value={proposedComment}
        onChange={(e) => setProposedComment(e.target.value)}
      />
      <button type="submit">Send Challenge</button>
    </form>
  );
}
