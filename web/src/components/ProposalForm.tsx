import { useState, type FormEvent } from "react";
import type { LocationDto } from "@tennisladder/shared";
import { LocationPicker } from "./LocationPicker.js";

/** "now" as datetime-local wants it (YYYY-MM-DDTHH:mm in the viewer's own timezone). */
function nowForDateTimeLocal(): string {
  return toDateTimeLocal(new Date());
}

function toDateTimeLocal(value: Date | string): string {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

/** Shared editor for a match proposal — used to amend your own offer and to counter theirs. */
export function ProposalForm({
  locations,
  initialDateTime,
  initialLocationId,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  locations: LocationDto[];
  initialDateTime: string;
  initialLocationId: string;
  submitLabel: string;
  onSubmit: (input: {
    proposedDateTime: string;
    proposedLocationId: string;
    proposedComment?: string;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [dateTime, setDateTime] = useState(toDateTimeLocal(initialDateTime));
  const [locationId, setLocationId] = useState(initialLocationId);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSubmit({
        proposedDateTime: new Date(dateTime).toISOString(),
        proposedLocationId: locationId,
        proposedComment: comment.trim() || undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="proposal-datetime">Date and time</label>
      <input
        id="proposal-datetime"
        type="datetime-local"
        required
        min={nowForDateTimeLocal()}
        value={dateTime}
        onChange={(e) => setDateTime(e.target.value)}
      />
      <label htmlFor="proposal-location">Location</label>
      <LocationPicker locations={locations} value={locationId} onChange={setLocationId} />
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
