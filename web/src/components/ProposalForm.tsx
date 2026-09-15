import { useState, type FormEvent } from "react";
import type { CounterProposeRequest, LocationDto, UserAddressDto } from "@tennisladder/shared";
import { LocationPicker } from "./LocationPicker.js";
import { toDateTimeLocal } from "../lib/dateTime.js";
import { MatchDateTimePicker } from "./MatchDateTimePicker.js";
import { WeatherForecast } from "./WeatherForecast.js";
import {
  defaultTravelOriginId,
  toTravelOriginAddressId,
  TravelOriginPicker,
} from "./TravelOriginPicker.js";

/** Shared editor for a match proposal — used to amend your own offer and to counter theirs. */
export function ProposalForm({
  locations,
  addresses,
  initialDateTime,
  initialLocationId,
  initialTravelOrigin,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  locations: LocationDto[];
  /** The player's own saved addresses, for saying where they're coming from. */
  addresses: UserAddressDto[] | undefined;
  initialDateTime: string;
  initialLocationId: string;
  initialTravelOrigin: UserAddressDto | null;
  submitLabel: string;
  onSubmit: (input: CounterProposeRequest) => Promise<void>;
  onCancel: () => void;
}) {
  const [dateTime, setDateTime] = useState(toDateTimeLocal(initialDateTime));
  const [locationId, setLocationId] = useState(initialLocationId);
  const [comment, setComment] = useState("");
  const [travelOrigin, setTravelOrigin] = useState<string | null>(null);
  const travelOriginId = travelOrigin ?? defaultTravelOriginId(addresses, initialTravelOrigin);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSubmit({
        proposedDateTime: new Date(dateTime).toISOString(),
        proposedLocationId: locationId,
        proposedComment: comment.trim() || undefined,
        // Left out while addresses are still loading, so a quick submit can't clear an earlier choice.
        travelOriginAddressId: addresses ? toTravelOriginAddressId(travelOriginId) : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="proposal-datetime">Date and time</label>
      <MatchDateTimePicker id="proposal-datetime" value={dateTime} onChange={setDateTime} />
      <label htmlFor="proposal-location">Location</label>
      <LocationPicker locations={locations} value={locationId} onChange={setLocationId} />
      <WeatherForecast locationId={locationId} dateTime={dateTime} />
      <TravelOriginPicker
        id="proposal-travel-origin"
        addresses={addresses}
        value={travelOriginId}
        onChange={setTravelOrigin}
      />
      <textarea
        placeholder="Optional comment"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <div className="form-actions">
        <button type="submit" disabled={busy}>
          {busy ? "Sending…" : submitLabel}
        </button>
        <button type="button" className="button-secondary" onClick={onCancel} disabled={busy}>
          Back
        </button>
      </div>
    </form>
  );
}
