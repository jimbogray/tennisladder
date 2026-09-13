import {
  formatSlotLabel,
  nextMatchSlotForDateTimeLocal,
  quarterHourSlots,
  todayForDateInput,
} from "../lib/dateTime.js";

const SLOTS = quarterHourSlots();

/**
 * Date field plus a quarter-hour dropdown, held as one "YYYY-MM-DDTHH:mm" value.
 *
 * A single datetime-local input can't do this: its `step` only *validates* the 15-minute rule, so
 * the native picker still lets you type 10:07 and only complains on submit. Offering the slots
 * explicitly means an invalid time can't be entered in the first place.
 */
export function MatchDateTimePicker({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const [date = "", time = ""] = value ? value.split("T") : [];
  const today = todayForDateInput();

  // On today, slots that have already passed aren't offerable.
  const earliestToday = nextMatchSlotForDateTimeLocal().slice(11);
  const slots = date === today ? SLOTS.filter((slot) => slot >= earliestToday) : SLOTS;

  function handleDate(nextDate: string) {
    if (!nextDate) return onChange("");
    // Keep the chosen time unless the new date is today and that time has now passed.
    const keepTime = time && (nextDate !== today || time >= earliestToday) ? time : "";
    onChange(keepTime ? `${nextDate}T${keepTime}` : `${nextDate}T`);
  }

  return (
    <div className="datetime-picker">
      <input
        id={id}
        type="date"
        required
        min={today}
        value={date}
        onChange={(e) => handleDate(e.target.value)}
      />
      <select
        aria-label="Time"
        required
        value={time}
        disabled={!date}
        onChange={(e) => onChange(`${date}T${e.target.value}`)}
      >
        <option value="">Time</option>
        {slots.map((slot) => (
          <option key={slot} value={slot}>
            {formatSlotLabel(slot)}
          </option>
        ))}
      </select>
    </div>
  );
}
