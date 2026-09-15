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
  googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL ?? "",

  azureCommunicationConnectionString: process.env.AZURE_COMMUNICATION_CONNECTION_STRING ?? "",
  emailFromAddress: process.env.EMAIL_FROM_ADDRESS ?? "ladder@example.com",

  registrationCodeTtlHours: Number(process.env.REGISTRATION_CODE_TTL_HOURS ?? 48),
  passwordResetTtlMinutes: Number(process.env.PASSWORD_RESET_TTL_MINUTES ?? 60),
  matchReminderLeadMinutes: Number(process.env.MATCH_REMINDER_LEAD_MINUTES ?? 60),
  staleResultReminderHours: Number(process.env.STALE_RESULT_REMINDER_HOURS ?? 24),
};
