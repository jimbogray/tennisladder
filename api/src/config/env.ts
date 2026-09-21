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
   * Sender number for outbound SMS, in E.164 (+15551234567), provisioned on the same Azure
   * Communication Services resource that sends the email. Blank leaves SMS off even when email is
   * configured — ACS won't send from a number it doesn't own, and a deployment that never texts
   * shouldn't have to rent one.
   */
  smsFromNumber: process.env.SMS_FROM_NUMBER ?? "",
  /**
   * When a message provider isn't configured, log what the unsent message would have carried — the
   * links in an email (password reset, invite, result confirmation) and the code in a phone
   * verification text — so those flows can still be completed. On by default for local dev; hosted
   * environments run with NODE_ENV=production and must opt in, which only staging does. Has no
   * effect once the provider is configured, so nothing bound for a real inbox or handset reaches
   * the logs.
   *
   * Still read from LOG_EMAIL_LINKS: the variable predates SMS and is already set on the staging
   * container app and in infra/provision-environment.sh, so it keeps its deployed name.
   */
  logUnsentMessages: process.env.LOG_EMAIL_LINKS ? process.env.LOG_EMAIL_LINKS === "true" : !isProduction,

  /**
   * OSRM routing server used for driving times (travelService). Defaults to the project's public
   * demo server, which is fine for a club-sized ladder but asks for light usage — point this at
   * your own instance if that stops being true.
   */
  routingBaseUrl: process.env.ROUTING_BASE_URL ?? "https://router.project-osrm.org",

  registrationCodeTtlHours: Number(process.env.REGISTRATION_CODE_TTL_HOURS ?? 48),
  passwordResetTtlMinutes: Number(process.env.PASSWORD_RESET_TTL_MINUTES ?? 60),
  // Short on purpose: the user is reading the code off their phone with the form still open, so a
  // long window only widens the guessing period for a six-digit secret.
  phoneVerificationTtlMinutes: Number(process.env.PHONE_VERIFICATION_TTL_MINUTES ?? 10),
  matchReminderLeadMinutes: Number(process.env.MATCH_REMINDER_LEAD_MINUTES ?? 60),
  staleResultReminderHours: Number(process.env.STALE_RESULT_REMINDER_HOURS ?? 24),
};
