/** Matches are only ever arranged on the quarter hour. */
export const MATCH_TIME_STEP_MINUTES = 15;
export const MATCH_TIME_STEP_SECONDS = MATCH_TIME_STEP_MINUTES * 60;

/**
 * Date and time for display, e.g. "10/12/2026, 8:45 PM". Same as toLocaleString's default but
 * without seconds, which are meaningless here — matches only ever fall on the quarter hour.
 */
export function formatMatchDateTime(value: string | Date): string {
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Just the time of day, e.g. "11:30 AM" — for times already pinned to a date on screen. */
export function formatTimeOfDay(value: string | Date): string {
  return new Date(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

const COMPLETE_DATE_TIME_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * Whether a date-and-time picker's value names an actual instant. Its value is partial
 * ("YYYY-MM-DDT") while only the date has been chosen, which `new Date(...)` reads as NaN.
 */
export function isCompleteDateTimeLocal(value: string): boolean {
  return COMPLETE_DATE_TIME_LOCAL.test(value);
}

/** Formats a date the way datetime-local wants it: YYYY-MM-DDTHH:mm in the viewer's timezone. */
export function toDateTimeLocal(value: Date | string): string {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

/** Today as a date input wants it: YYYY-MM-DD in the viewer's timezone. */
export function todayForDateInput(): string {
  return toDateTimeLocal(new Date()).slice(0, 10);
}

/** Every quarter-hour slot in a day, as "HH:mm". */
export function quarterHourSlots(): string[] {
  const slots: string[] = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += MATCH_TIME_STEP_MINUTES) {
    const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
    const mm = String(minutes % 60).padStart(2, "0");
    slots.push(`${hh}:${mm}`);
  }
  return slots;
}

/** "20:45" -> "8:45 PM" (or the viewer's locale equivalent). */
export function formatSlotLabel(slot: string): string {
  const [hours, minutes] = slot.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * Earliest selectable slot — the next quarter hour from now.
 *
 * This has to land on the grid, not just be "now": a datetime-local input measures its `step` from
 * the `min` value, so a min of 10:37 with a 15-minute step would offer 10:37, 10:52, 11:07 rather
 * than clean quarter hours.
 */
export function nextMatchSlotForDateTimeLocal(): string {
  const date = new Date();
  date.setSeconds(0, 0);
  const remainder = date.getMinutes() % MATCH_TIME_STEP_MINUTES;
  date.setMinutes(date.getMinutes() + (MATCH_TIME_STEP_MINUTES - remainder));
  return toDateTimeLocal(date);
}
