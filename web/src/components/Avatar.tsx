/** A user's initials in a round badge — the portrait for accounts, which have no photo. */
export function Avatar({ firstName, lastName }: { firstName: string; lastName: string }) {
  const initials = `${firstName.trim().charAt(0)}${lastName.trim().charAt(0)}`.toUpperCase();

  return (
    // Decorative: the name is always shown or announced alongside it.
    <span className="avatar" aria-hidden="true">
      {initials || "?"}
    </span>
  );
}
