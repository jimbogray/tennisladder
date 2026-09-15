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
    ustaRating: user.ustaRating?.toString() ?? null,
    profileCompletedAt: user.profileCompletedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}
