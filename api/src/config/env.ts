import "dotenv/config";

const isProduction = process.env.NODE_ENV === "production";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Convenience default for local dev, hard failure in production. Used for the token signing
 * secrets: falling back to a value that's committed to the repo would let anyone mint a valid
 * admin token, so a missing secret has to stop the process rather than quietly work.
 */
function requiredInProduction(name: string, devFallback: string): string {
  const value = process.env[name];
  if (value) return value;
  if (isProduction) {
    throw new Error(`Missing required environment variable in production: ${name}`);
  }
  return devFallback;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  /**
   * How many reverse proxies sit in front of the API, for Express's `trust proxy`. Hosted
   * environments are behind the Container Apps ingress; local dev is behind nothing, where this is
   * harmless because no local client sets X-Forwarded-For. Rate limiting keys off `req.ip`, so
   * getting this wrong matters in both directions: too low and every caller shares one bucket (one
   * attacker locks out the club), too high and a caller can spoof their address past the limits.
   * Verify with GET /api/health, which echoes the address the API resolved for the caller.
   */
  trustProxyHops: Number(process.env.TRUST_PROXY_HOPS ?? 1),
  webAppUrl: process.env.WEB_APP_URL ?? "http://localhost:5173",

  databaseUrl: required("DATABASE_URL"),

  jwtAccessSecret: requiredInProduction("JWT_ACCESS_SECRET", "dev-access-secret"),
  jwtAccessTtlMinutes: Number(process.env.JWT_ACCESS_TTL_MINUTES ?? 15),
  jwtRefreshSecret: requiredInProduction("JWT_REFRESH_SECRET", "dev-refresh-secret"),
  jwtRefreshTtlDays: Number(process.env.JWT_REFRESH_TTL_DAYS ?? 30),

  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  // Must match a redirect URI registered on the OAuth client in Google Cloud Console.
  googleCallbackUrl:
    process.env.GOOGLE_CALLBACK_URL ?? "http://localhost:4000/api/auth/google/callback",

  azureCommunicationConnectionString: process.env.AZURE_COMMUNICATION_CONNECTION_STRING ?? "",
  emailFromAddress: process.env.EMAIL_FROM_ADDRESS ?? "ladder@example.com",
  /**
   * When email isn't configured, log the links an unsent email would have carried (password reset,
   * invite, result confirmation) so those flows can still be completed. On by default for local dev;
   * hosted environments run with NODE_ENV=production and must opt in, which only staging does. Has
   * no effect once email is configured, so links bound for a real inbox never reach the logs.
   */
  logEmailLinks: process.env.LOG_EMAIL_LINKS ? process.env.LOG_EMAIL_LINKS === "true" : !isProduction,

  /**
   * IANA zone the club plays in, used to write match times into emails. Emails are rendered on the
   * server, so unlike the SPA there's no viewer locale to defer to. UTC keeps the fallback honest
   * rather than silently guessing the host's zone, but any club not on it should set this.
   */
  clubTimeZone: process.env.CLUB_TIMEZONE ?? "UTC",

  /**
   * OSRM routing server used for driving times (travelService). Defaults to the project's public
   * demo server, which is fine for a club-sized ladder but asks for light usage — point this at
   * your own instance if that stops being true.
   */
  routingBaseUrl: process.env.ROUTING_BASE_URL ?? "https://router.project-osrm.org",

  registrationCodeTtlHours: Number(process.env.REGISTRATION_CODE_TTL_HOURS ?? 48),
  passwordResetTtlMinutes: Number(process.env.PASSWORD_RESET_TTL_MINUTES ?? 60),
  matchReminderLeadMinutes: Number(process.env.MATCH_REMINDER_LEAD_MINUTES ?? 60),
  staleResultReminderHours: Number(process.env.STALE_RESULT_REMINDER_HOURS ?? 24),
};
