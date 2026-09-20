import { PrismaClient } from "@prisma/client";

// Globally exclude the password hash from every query result so it can never leak into an API
// response. Reads that genuinely need it (i.e. login verification) opt back in per-query with
// `omit: { passwordHash: false }`.
//
// The geocoding columns on Location and UserAddress are likewise omitted: they're an internal
// cache for the weather forecast and driving times (see geocodingService.ts), not part of
// LocationDto or UserAddressDto.
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
      geocodedAddress: true,
    },
  },
});
