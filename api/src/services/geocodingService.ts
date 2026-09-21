import { prisma } from "../config/prisma.js";
import { getJson } from "./upstream.js";

/**
 * Turning the free-text addresses players and admins type into coordinates, for the weather
 * forecast (weatherService) and driving times (travelService).
 *
 * Geocoding is OpenStreetMap's Nominatim — free and keyless. Its usage policy caps clients at one
 * request per second and requires results to be cached, so a Location carries its own lazily-filled
 * cache columns and is only looked up again when its address changes.
 *
 * A player's saved address is the exception: it is looked up once, while it's being saved, and the
 * address itself is then discarded rather than cached (addressService.createAddress). There's
 * nothing left to look up again, which is the point — see the UserAddress model.
 */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_MIN_INTERVAL_MS = 1100;

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** NO_ADDRESS: nothing to look up. NOT_FOUND: looked up, and the map doesn't know it. */
export type GeocodeResult =
  | { status: "FOUND"; coordinates: Coordinates }
  | { status: "NO_ADDRESS" }
  | { status: "NOT_FOUND" };

let nextNominatimSlot = 0;

/** Spaces Nominatim requests at least NOMINATIM_MIN_INTERVAL_MS apart across the process. */
async function waitForNominatimSlot(): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, nextNominatimSlot);
  nextNominatimSlot = slot + NOMINATIM_MIN_INTERVAL_MS;
  if (slot > now) await new Promise((resolve) => setTimeout(resolve, slot - now));
}

/**
 * Coordinates for a free-text address, or null if it can't be found. Throws
 * UpstreamUnavailableError when Nominatim itself fails, so a transient outage isn't cached as
 * "not found".
 *
 * Addresses come from Google Places, which knows buildings and street numbers OpenStreetMap often
 * doesn't ("1 Tennis Court Rd, Wimbledon, London SW19 5AE, UK" finds nothing). On a miss, retry
 * with the leading part dropped — "Wimbledon, London SW19 5AE, UK" is still far more precise than
 * either a weather forecast or a driving time needs.
 */
export async function geocode(address: string): Promise<Coordinates | null> {
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  // Never broaden down to a lone trailing part, which is usually just the country.
  const attempts = Math.max(1, Math.min(3, parts.length - 1));

  for (let i = 0; i < attempts; i++) {
    const url = new URL(NOMINATIM_URL);
    url.searchParams.set("q", parts.slice(i).join(", ") || address);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");

    await waitForNominatimSlot();
    const results = (await getJson(url)) as { lat: string; lon: string }[];
    if (results.length > 0) {
      return { latitude: Number(results[0].lat), longitude: Number(results[0].lon) };
    }
  }
  return null;
}

/** The cache columns a Location carries; see the comments on the model. */
interface GeocodedRow {
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  geocodedAddress: string | null;
}

/**
 * Coordinates for a match location, filling its cache on the way. A stale cache is one taken from
 * a different address than the row now holds. A miss is cached too (null coordinates), so an
 * address the map doesn't know isn't looked up again every time.
 */
export async function geocodeLocation(
  location: GeocodedRow & { id: string },
): Promise<GeocodeResult> {
  if (!location.address) return { status: "NO_ADDRESS" };

  let { latitude, longitude } = location;
  if (location.geocodedAddress !== location.address) {
    const coordinates = await geocode(location.address);
    latitude = coordinates?.latitude ?? null;
    longitude = coordinates?.longitude ?? null;
    await prisma.location.update({
      where: { id: location.id },
      data: { latitude, longitude, geocodedAddress: location.address },
    });
  }

  if (latitude === null || longitude === null) return { status: "NOT_FOUND" };
  return { status: "FOUND", coordinates: { latitude, longitude } };
}
