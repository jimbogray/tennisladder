/** A user's initials in a round badge — the portrait for accounts, which have no photo. */
export function Avatar({
  firstName,
  lastName,
  size = "small",
}: {
  firstName: string;
  lastName: string;
  size?: "small" | "large";
}) {
  const initials = `${firstName.trim().charAt(0)}${lastName.trim().charAt(0)}`.toUpperCase();

  return (
    // Decorative: the name is always shown or announced alongside it.
    <span className={`avatar avatar-${size}`} aria-hidden="true">
      {initials || "?"}
    </span>
  );
}
