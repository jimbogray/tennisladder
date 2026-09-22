import type { AvatarId } from "@tennisladder/shared";
import { AvatarArtwork } from "./avatarArt.js";

/**
 * A player's portrait: the avatar they picked, or their initials in a round badge if they haven't
 * picked one. Decorative either way — the name is always shown or announced alongside it.
 */
export function Avatar({
  firstName,
  lastName,
  avatarId,
  size = "md",
}: {
  firstName: string;
  lastName: string;
  avatarId?: AvatarId | null;
  size?: "sm" | "md" | "lg";
}) {
  const className = `avatar avatar--${size}`;

  if (avatarId) {
    return (
      <span className={`${className} avatar--art`} aria-hidden="true">
        <AvatarArtwork avatarId={avatarId} />
      </span>
    );
  }

  const initials = `${firstName.trim().charAt(0)}${lastName.trim().charAt(0)}`.toUpperCase();

  return (
    <span className={className} aria-hidden="true">
      {initials || "?"}
    </span>
  );
}
