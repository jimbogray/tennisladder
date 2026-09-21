import { z } from "zod";
import { Prisma } from "@prisma/client";
import type { UserAddressDto } from "@tennisladder/shared";
import { prisma } from "../config/prisma.js";
import { geocode } from "./geocodingService.js";
import { UpstreamUnavailableError } from "./upstream.js";

/**
 * A player's saved addresses.
 *
 * The postal address they type is geocoded here, on the way in, and then dropped: only the label
 * and the coordinates are written to the database (see the UserAddress model). Nothing downstream
 * needs the address itself — a driving time is worked out from coordinates, and the picker shows
 * players their own labels — so there is no reason to keep their home address on disk.
 */

/**
 * Thrown for rejected saved-address changes: a duplicate label, too many addresses, or an address
 * the map doesn't recognise. Surfaced as a 400.
 */
export class AddressValidationError extends Error {}

/** Enough for home, work and a few regular stops, without letting the list grow unbounded. */
export const MAX_ADDRESSES_PER_USER = 10;

export const addressInputSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "Give the address a label, such as Home")
    .max(40, "Address labels must be 40 characters or fewer"),
  address: z
    .string()
    .trim()
    .min(1, "Enter an address")
    .max(500, "Addresses must be 500 characters or fewer"),
});

export type AddressInput = z.infer<typeof addressInputSchema>;

/** For registration, where several addresses arrive at once and can't clash with each other. */
export const addressListSchema = z
  .array(addressInputSchema)
  .max(MAX_ADDRESSES_PER_USER, `You can save up to ${MAX_ADDRESSES_PER_USER} addresses`)
  .refine(
    (addresses) =>
      new Set(addresses.map((a) => a.label.toLowerCase())).size === addresses.length,
    { message: "Each address needs a different label" },
  );

/**
 * Structural rather than Prisma's `UserAddress`, because callers hand this rows read with the
 * coordinate columns left out (prisma.ts) as well as rows that opted back into them.
 */
export function toUserAddressDto(address: {
  id: string;
  label: string;
  createdAt: Date;
}): UserAddressDto {
  return {
    id: address.id,
    label: address.label,
    createdAt: address.createdAt.toISOString(),
  };
}

/**
 * Coordinates for an address the player just typed, or a rejection they can act on.
 *
 * Lets UpstreamUnavailableError through: "Nominatim is down" and "no such place" are different
 * answers, and only the second is the player's problem to fix.
 */
async function coordinatesFor(address: string) {
  const coordinates = await geocode(address);
  if (!coordinates) {
    throw new AddressValidationError(
      "We couldn't find that address on the map. Try the street and town, or a postcode.",
    );
  }
  return coordinates;
}

export function listAddresses(userId: string) {
  return prisma.userAddress.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
}

export async function createAddress(userId: string, input: AddressInput) {
  const existing = await listAddresses(userId);
  if (existing.length >= MAX_ADDRESSES_PER_USER) {
    throw new AddressValidationError(`You can save up to ${MAX_ADDRESSES_PER_USER} addresses`);
  }
  // The unique index is case-sensitive, and "home" next to "Home" would be just as confusing.
  if (existing.some((a) => a.label.toLowerCase() === input.label.toLowerCase())) {
    throw new AddressValidationError(`You already have an address labelled "${input.label}"`);
  }
  // Before the insert, so a request that can't be geocoded never writes the address anywhere.
  const coordinates = await coordinatesFor(input.address);

  try {
    return await prisma.userAddress.create({ data: { userId, label: input.label, ...coordinates } });
  } catch (err) {
    // A concurrent request saved the same label between the check above and this insert.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AddressValidationError(`You already have an address labelled "${input.label}"`);
    }
    throw err;
  }
}

/**
 * Deletes one of the user's own addresses. Any match that used it as a travel origin loses that
 * choice (the foreign key cascades). Returns false when there's no such address for this user.
 */
export async function deleteAddress(userId: string, addressId: string) {
  const { count } = await prisma.userAddress.deleteMany({ where: { id: addressId, userId } });
  return count > 0;
}

/**
 * The same thing for registration, where several addresses arrive at once and the account doesn't
 * exist yet.
 *
 * A failure here is deliberately not fatal. Signing up shouldn't fail because OpenStreetMap is
 * having a bad morning, or because it doesn't recognise one of the streets — so an address that
 * can't be placed is left out, and the player can add it again on their profile page, which is the
 * one place a real error message can be put in front of them.
 */
export async function geocodeNewUserAddresses(inputs: AddressInput[]) {
  const rows: { label: string; latitude: number; longitude: number }[] = [];

  for (const input of inputs) {
    try {
      const coordinates = await geocode(input.address);
      if (coordinates) rows.push({ label: input.label, ...coordinates });
      // Labelled, never logged with the address itself: this whole change exists to keep a home
      // address out of anything that persists, and logs persist.
      else console.warn(`Registration address "${input.label}" skipped: not found on the map`);
    } catch (err) {
      if (!(err instanceof UpstreamUnavailableError)) throw err;
      console.warn(`Registration address "${input.label}" skipped: ${err.message}`);
    }
  }

  return rows;
}
