import { PrismaClient } from "@prisma/client";

// Globally exclude the password hash from every query result so it can never leak into an API
// response. Reads that genuinely need it (i.e. login verification) opt back in per-query with
// `omit: { passwordHash: false }`.
//
// Location's geocoding columns are likewise omitted: they're an internal cache for the weather
// forecast (see weatherService.ts), not part of LocationDto.
export const prisma = new PrismaClient({
  omit: {
    user: {
      passwordHash: true,
    },
    location: {
      latitude: true,
      longitude: true,
      geocodedAddress: true,
    },
  },
});
