import { z } from "zod";
import { Prisma, type UserAddress } from "@prisma/client";
import type { UserAddressDto } from "@tennisladder/shared";
import { prisma } from "../config/prisma.js";

/** Thrown for rejected saved-address changes (duplicate label, too many addresses). Surfaced as a 400. */
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

export function toUserAddressDto(address: UserAddress): UserAddressDto {
  return {
    id: address.id,
    label: address.label,
    address: address.address,
    createdAt: address.createdAt.toISOString(),
  };
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
  try {
    return await prisma.userAddress.create({ data: { userId, ...input } });
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
