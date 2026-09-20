import type { ForecastDayDto, ForecastHourDto, LocationForecastDto } from "@tennisladder/shared";
import { prisma } from "../config/prisma.js";
import { geocodeLocation, type Coordinates } from "./geocodingService.js";
import { getJson } from "./upstream.js";

/**
 * Weather forecasts for match locations.
 *
 * Forecasts come from Open-Meteo, which is free and keyless; addresses are turned into
 * coordinates by geocodingService, which caches them on the Location.
 */

const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";

// Open-Meteo's maximum. A match further out than this has no forecast yet.
const FORECAST_DAYS = 16;
const OUTLOOK_DAYS = 7;
// The window shown around a match time: a little before (are the courts wet?) and through the
// couple of hours a match takes.
const WINDOW_HOURS_BEFORE = 2;
const WINDOW_HOURS_AFTER = 3;

const FORECAST_CACHE_TTL_MS = 30 * 60 * 1000;

interface OpenMeteoResponse {
  utc_offset_seconds: number;
  hourly: {
    time: number[];
    weather_code: number[];
    temperature_2m: number[];
    precipitation_probability: (number | null)[];
    wind_speed_10m: number[];
    is_day: number[];
  };
  daily: {
    time: number[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: (number | null)[];
  };
}

const forecastCache = new Map<string, { expiresAt: number; data: OpenMeteoResponse }>();

async function fetchForecast({ latitude, longitude }: Coordinates): Promise<OpenMeteoResponse> {
  const key = `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
  const now = Date.now();
  const cached = forecastCache.get(key);
  if (cached && cached.expiresAt > now) return cached.data;

  const url = new URL(OPEN_METEO_URL);
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set(
    "hourly",
    "weather_code,temperature_2m,precipitation_probability,wind_speed_10m,is_day",
  );
  url.searchParams.set(
    "daily",
    "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
  );
  // Local timezone so daily aggregates cover the location's own calendar days; unix timestamps so
  // hourly times are unambiguous instants regardless.
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("timeformat", "unixtime");
  url.searchParams.set("forecast_days", String(FORECAST_DAYS));

  const data = (await getJson(url)) as OpenMeteoResponse;

  for (const [cachedKey, entry] of forecastCache) {
    if (entry.expiresAt <= now) forecastCache.delete(cachedKey);
  }
  forecastCache.set(key, { expiresAt: now + FORECAST_CACHE_TTL_MS, data });
  return data;
}

function outlookDays(data: OpenMeteoResponse): ForecastDayDto[] {
  const { daily, utc_offset_seconds: offset } = data;
  return daily.time.slice(0, OUTLOOK_DAYS).map((localMidnight, i) => ({
    // Shift local midnight into UTC terms, plus half a day of slack so a DST change between now
    // and that day can't tip it onto the previous date.
    date: new Date((localMidnight + offset + 12 * 3600) * 1000).toISOString().slice(0, 10),
    weatherCode: daily.weather_code[i],
    temperatureMaxC: daily.temperature_2m_max[i],
    temperatureMinC: daily.temperature_2m_min[i],
    precipitationProbabilityMax: daily.precipitation_probability_max[i],
  }));
}

/** The hours around `at`, or null when `at` isn't covered by the forecast. */
function hoursAround(data: OpenMeteoResponse, at: Date): ForecastHourDto[] | null {
  const { hourly } = data;
  const startHour = Math.floor(at.getTime() / 3_600_000) * 3600;
  if (!hourly.time.includes(startHour)) return null;

  const from = startHour - WINDOW_HOURS_BEFORE * 3600;
  const to = startHour + WINDOW_HOURS_AFTER * 3600;
  const hours: ForecastHourDto[] = [];
  hourly.time.forEach((time, i) => {
    if (time < from || time > to) return;
    hours.push({
      time: new Date(time * 1000).toISOString(),
      weatherCode: hourly.weather_code[i],
      temperatureC: hourly.temperature_2m[i],
      precipitationProbability: hourly.precipitation_probability[i],
      windSpeedKmh: hourly.wind_speed_10m[i],
      isDay: hourly.is_day[i] === 1,
    });
  });
  return hours;
}

/** Forecast for a location, or null if the location doesn't exist. */
export async function getLocationForecast(
  locationId: string,
  at?: Date,
): Promise<LocationForecastDto | null> {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    omit: { latitude: false, longitude: false, geocodedAddress: false },
  });
  if (!location) return null;

  const geocoded = await geocodeLocation(location);
  if (geocoded.status === "NO_ADDRESS") return { status: "NO_ADDRESS" };
  if (geocoded.status === "NOT_FOUND") return { status: "ADDRESS_NOT_FOUND" };

  const data = await fetchForecast(geocoded.coordinates);
  if (!at) return { status: "AVAILABLE", days: outlookDays(data), hours: [] };

  const hours = hoursAround(data, at);
  return hours ? { status: "AVAILABLE", days: [], hours } : { status: "OUT_OF_RANGE" };
}
