import { Link } from "react-router-dom";
import type { UserAddressDto } from "@tennisladder/shared";

/**
 * The address to preselect: whatever the player already chose for this match, otherwise their
 * first saved address, otherwise nothing ("" means not specified).
 */
export function defaultTravelOriginId(
  addresses: UserAddressDto[] | undefined,
  current?: UserAddressDto | null,
) {
  return current?.id ?? addresses?.[0]?.id ?? "";
}

/** "" (not specified) becomes null, which clears any earlier choice on the server. */
export function toTravelOriginAddressId(value: string) {
  return value || null;
}

/** Which saved address the player is travelling from. Private to them. */
export function TravelOriginPicker({
  id,
  addresses,
  value,
  onChange,
}: {
  id: string;
  addresses: UserAddressDto[] | undefined;
  value: string;
  onChange: (addressId: string) => void;
}) {
  if (!addresses) return null;

  if (addresses.length === 0) {
    return (
      <small className="travel-origin-hint">
        Save your home or office address on your <Link to="/profile">profile</Link> to say where
        you're coming from.
      </small>
    );
  }

  return (
    <>
      <label htmlFor={id}>Coming from</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={`${id}-hint`}>
        <option value="">Not specified</option>
        {/* Label only, never the street address: (userId, label) is unique, so it still tells
            them apart, and a full home address doesn't belong on a match form. */}
        {addresses.map((address) => (
          <option key={address.id} value={address.id}>
            {address.label}
          </option>
        ))}
      </select>
      <small id={`${id}-hint`}>Only you can see this.</small>
    </>
  );
}
