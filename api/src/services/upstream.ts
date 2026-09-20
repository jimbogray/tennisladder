import { env } from "../config/env.js";

/**
 * Shared plumbing for the free, keyless third-party services this API reads from (Open-Meteo for
 * weather, Nominatim for geocoding, OSRM for driving times).
 */

/** A provider was unreachable or returned an error — distinct from "no such data exists". */
export class UpstreamUnavailableError extends Error {}

const DEFAULT_TIMEOUT_MS = 8000;

// Nominatim rejects requests that don't identify their client, and OSRM's demo server asks for
// the same courtesy.
const USER_AGENT = `PlayMoreTennisLadder/1.0 (+${env.webAppUrl})`;

export async function getJson(url: URL, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new UpstreamUnavailableError(`Request to ${url.host} failed: ${String(err)}`);
  }
  if (!res.ok) {
    throw new UpstreamUnavailableError(`${url.host} responded ${res.status}`);
  }
  return res.json();
}
