/** Display helpers for forecast data, which the API always returns in metric units. */

/** WMO weather interpretation codes, as used by Open-Meteo, grouped into what a player cares about. */
export function describeWeather(code: number, isDay = true): { icon: string; label: string } {
  if (code === 0) return { icon: isDay ? "☀️" : "🌙", label: "Clear" };
  if (code <= 2) return { icon: isDay ? "⛅" : "☁️", label: "Partly cloudy" };
  if (code === 3) return { icon: "☁️", label: "Overcast" };
  if (code <= 48) return { icon: "🌫️", label: "Fog" };
  if (code <= 57) return { icon: "🌦️", label: "Drizzle" };
  if (code <= 67) return { icon: "🌧️", label: "Rain" };
  if (code <= 77) return { icon: "🌨️", label: "Snow" };
  if (code <= 82) return { icon: "🌧️", label: "Showers" };
  if (code <= 86) return { icon: "🌨️", label: "Snow showers" };
  return { icon: "⛈️", label: "Thunderstorm" };
}

// The countries that still use Fahrenheit and miles per hour day to day.
const IMPERIAL_REGIONS = new Set(["US", "LR", "MM"]);

function usesImperialUnits(): boolean {
  try {
    return IMPERIAL_REGIONS.has(new Intl.Locale(navigator.language).maximize().region ?? "");
  } catch {
    return false;
  }
}

const imperial = usesImperialUnits();

export const temperatureUnit = imperial ? "°F" : "°C";

/** Just the degrees ("71°"); show `temperatureUnit` once alongside a group of these. */
export function formatTemperature(celsius: number): string {
  return `${Math.round(imperial ? (celsius * 9) / 5 + 32 : celsius)}°`;
}

export function formatWindSpeed(kmh: number): string {
  return imperial ? `${Math.round(kmh / 1.609)} mph` : `${Math.round(kmh)} km/h`;
}

/**
 * "YYYY-MM-DD" -> "Mon". A weekday alone is unambiguous across a 7-day outlook and keeps the tiles
 * narrow enough to fit a phone. Parsed as a local date so the viewer's timezone can't shift it.
 */
export function formatForecastDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { weekday: "short" });
}

export function formatForecastHour(time: string): string {
  return new Date(time).toLocaleTimeString(undefined, { hour: "numeric" });
}
