import { useQuery } from "@tanstack/react-query";
import { fetchLocationForecast, fetchLocations } from "../api/locations.js";
import { formatMatchDateTime, isCompleteDateTimeLocal } from "../lib/dateTime.js";
import {
  describeWeather,
  formatForecastDay,
  formatForecastHour,
  formatTemperature,
  formatWindSpeed,
  temperatureUnit,
} from "../lib/weather.js";

const UNAVAILABLE_MESSAGES = {
  NO_ADDRESS: "No forecast: this location doesn't have an address yet.",
  ADDRESS_NOT_FOUND: "No forecast: this location's address couldn't be found on the map.",
  OUT_OF_RANGE: "Forecasts go up to 16 days ahead. Check back closer to the match.",
};

function RainChance({ percent }: { percent: number | null }) {
  // Keep the (empty) row when there's no figure so the slots stay aligned.
  if (percent === null) return <span className="weather-slot-detail">{" "}</span>;
  return (
    <span className="weather-slot-detail" title="Chance of rain">
      <span aria-hidden="true">💧</span>
      {percent}%<span className="visually-hidden"> chance of rain</span>
    </span>
  );
}

/**
 * Forecast for the location being proposed: a week's outlook until a date and time are chosen,
 * then the hours around the match. Renders nothing until a location is picked, and nothing at all
 * for an indoor court, where the weather doesn't decide anything.
 *
 * `dateTime` is the picker's "YYYY-MM-DDTHH:mm" value, which is partial ("YYYY-MM-DDT") while
 * only a date has been chosen.
 */
export function WeatherForecast({ locationId, dateTime }: { locationId: string; dateTime: string }) {
  const at = isCompleteDateTimeLocal(dateTime) ? new Date(dateTime).toISOString() : undefined;
  // Already in the cache: every screen that renders this has loaded the picker's locations.
  const { data: locations } = useQuery({ queryKey: ["locations"], queryFn: fetchLocations });
  const isIndoor = locations?.find((loc) => loc.id === locationId)?.isIndoor ?? false;
  const { data, isLoading, isError } = useQuery({
    queryKey: ["locations", locationId, "forecast", at ?? null],
    queryFn: () => fetchLocationForecast(locationId, at),
    // Don't ask for a forecast nobody will see. While the locations list is still loading this is
    // false, so an indoor court never flashes one either.
    enabled: Boolean(locationId) && Boolean(locations) && !isIndoor,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  if (!locationId || isIndoor) return null;

  const startHour = at ? Math.floor(new Date(at).getTime() / 3_600_000) : null;

  return (
    <section className="weather-forecast" aria-live="polite">
      <div className="weather-forecast-heading">
        <span>Weather</span>
        <span className="weather-forecast-period">
          {at ? `Around ${formatMatchDateTime(at)}` : "Next 7 days"} · {temperatureUnit}
        </span>
      </div>

      {isLoading ? <p className="weather-forecast-note">Loading forecast…</p> : null}
      {isError ? (
        <p className="weather-forecast-note">The weather forecast is unavailable right now.</p>
      ) : null}
      {data && data.status !== "AVAILABLE" ? (
        <p className="weather-forecast-note">{UNAVAILABLE_MESSAGES[data.status]}</p>
      ) : null}

      {data?.status === "AVAILABLE" ? (
        <ol className="weather-slots">
          {at
            ? data.hours.map((hour) => {
                const weather = describeWeather(hour.weatherCode, hour.isDay);
                const isStart = Math.floor(new Date(hour.time).getTime() / 3_600_000) === startHour;
                return (
                  <li
                    key={hour.time}
                    className={isStart ? "weather-slot weather-slot-match" : "weather-slot"}
                    aria-current={isStart ? "time" : undefined}
                  >
                    <span className="weather-slot-label">
                      {isStart ? "Start" : formatForecastHour(hour.time)}
                    </span>
                    <span className="weather-slot-icon" role="img" aria-label={weather.label}>
                      {weather.icon}
                    </span>
                    <span className="weather-slot-temp">{formatTemperature(hour.temperatureC)}</span>
                    <RainChance percent={hour.precipitationProbability} />
                    <span className="weather-slot-detail">{formatWindSpeed(hour.windSpeedKmh)}</span>
                  </li>
                );
              })
            : data.days.map((day) => {
                const weather = describeWeather(day.weatherCode);
                return (
                  <li key={day.date} className="weather-slot">
                    <span className="weather-slot-label">{formatForecastDay(day.date)}</span>
                    <span className="weather-slot-icon" role="img" aria-label={weather.label}>
                      {weather.icon}
                    </span>
                    <span className="weather-slot-temp">
                      {formatTemperature(day.temperatureMaxC)}
                      <span className="weather-slot-low">{formatTemperature(day.temperatureMinC)}</span>
                    </span>
                    <RainChance percent={day.precipitationProbabilityMax} />
                  </li>
                );
              })}
        </ol>
      ) : null}

      <a
        className="weather-attribution"
        href="https://open-meteo.com/"
        target="_blank"
        rel="noreferrer"
      >
        Weather data by Open-Meteo.com
      </a>
    </section>
  );
}
