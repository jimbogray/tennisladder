import { PrismaClient } from "@prisma/client";

// Globally exclude the password hash from every query result so it can never leak into an API
// response. Reads that genuinely need it (i.e. login verification) opt back in per-query with
// `omit: { passwordHash: false }`.
//
// Location's geocoding cache is likewise omitted: it's internal to the weather forecast and
// driving times (see geocodingService.ts), not part of LocationDto. So are a saved address's
// coordinates — they're all that's left of an address the player gave us, and nothing outside
// travelService has any business reading them back.
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
    userAddress: {
      latitude: true,
      longitude: true,
    },
  },
});
