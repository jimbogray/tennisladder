/**
 * A user's own labelled addresses, each with a remove button. Renders nothing when empty.
 *
 * `address` is optional because a saved one doesn't have one to show: the server keeps only the
 * coordinates. Registration passes it, since there the list is of addresses still sitting in the
 * browser, not yet sent anywhere.
 */
export function SavedAddressList({
  addresses,
  onRemove,
  removingKey,
}: {
  addresses: { key: string; label: string; address?: string }[];
  onRemove: (key: string) => void;
  removingKey?: string | null;
}) {
  if (addresses.length === 0) return null;

  return (
    <ul className="location-list saved-address-list">
      {addresses.map(({ key, label, address }) => (
        <li key={key} className="location-item">
          <div className="location-row">
            <div>
              <strong>{label}</strong>
              {address ? <p className="location-address">{address}</p> : null}
            </div>
            <div className="location-actions">
              <button
                type="button"
                className="button-secondary"
                onClick={() => onRemove(key)}
                disabled={removingKey === key}
                aria-label={`Remove ${label}`}
              >
                {removingKey === key ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
