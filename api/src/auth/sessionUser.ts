import type { User } from "@prisma/client";
import type { SessionUserDto } from "@tennisladder/shared";

// Accept a User without the (globally omitted) passwordHash — this helper never reads it.
export type SessionUser = Omit<User, "passwordHash">;

/** The signed-in user's own view of their account: the public fields plus private ones like email. */
export function toSessionUserDto(user: SessionUser): SessionUserDto {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    participatesInLadder: user.participatesInLadder,
    points: user.points,
    email: user.email,
    // toFixed(1), not toString(): a stored 3.0 must come back as "3.0" so it matches both the
    // ladder's rendering and the rating options on the profile form.
    ustaRating: user.ustaRating?.toFixed(1) ?? null,
    profileCompletedAt: user.profileCompletedAt?.toISOString() ?? null,
    // Non-null only once a texted code confirmed it, so this doubles as "phone verified".
    phoneNumber: user.phoneNumber,
    createdAt: user.createdAt.toISOString(),
  };
}
