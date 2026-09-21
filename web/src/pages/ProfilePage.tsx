import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { USTA_RATINGS, type UstaRating } from "@tennisladder/shared";
import { updateMyProfile } from "../api/players.js";
import { createAddress, deleteAddress, fetchMyAddresses } from "../api/addresses.js";
import { ApiError } from "../api/client.js";
import { SavedAddressForm } from "../components/SavedAddressForm.js";
import { SavedAddressList } from "../components/SavedAddressList.js";
import { useAuth } from "../hooks/useAuth.js";

/** The places this user travels to matches from. Private to them. */
function AddressesSection() {
  const queryClient = useQueryClient();
  const { data: addresses, isLoading } = useQuery({
    queryKey: ["addresses"],
    queryFn: fetchMyAddresses,
  });
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRemove(id: string) {
    setError(null);
    setRemovingId(id);
    try {
      await deleteAddress(id);
      await queryClient.invalidateQueries({ queryKey: ["addresses"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't remove that address. Please try again.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <section className="profile-addresses">
      <h2>Your addresses</h2>
      <p className="profile-section-hint">
        Where you travel to matches from. When you propose or accept a match you can say which one
        you're coming from. Only you can see these, and we keep only the map location each one
        works out to — never the address you typed.
      </p>
      {error && <p role="alert">{error}</p>}
      {isLoading || !addresses ? (
        <p>Loading…</p>
      ) : (
        <>
          <SavedAddressList
            addresses={addresses.map((a) => ({ key: a.id, label: a.label }))}
            onRemove={handleRemove}
            removingKey={removingId}
          />
          <SavedAddressForm
            idPrefix="profile-address"
            existingLabels={addresses.map((a) => a.label)}
            onAdd={async (input) => {
              await createAddress(input);
              await queryClient.invalidateQueries({ queryKey: ["addresses"] });
            }}
          />
        </>
      )}
    </section>
  );
}

export function ProfilePage() {
  const { user, updateUser } = useAuth();
  // Rendered behind RequireAuth, so a user is always present.
  const [firstName, setFirstName] = useState(user!.firstName);
  const [lastName, setLastName] = useState(user!.lastName);
  // "" is the "no rating yet" option; the API stores it as null.
  const [ustaRating, setUstaRating] = useState(user!.ustaRating ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  // A rating is a ladder concept, so coach-admins don't get the field at all.
  const canSetRating = user.participatesInLadder;
  const unchanged =
    firstName.trim() === user.firstName &&
    lastName.trim() === user.lastName &&
    (!canSetRating || ustaRating === (user.ustaRating ?? ""));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const updated = await updateMyProfile({
        firstName,
        lastName,
        ustaRating: ustaRating === "" ? null : (ustaRating as UstaRating),
      });
      updateUser(updated);
      setFirstName(updated.firstName);
      setLastName(updated.lastName);
      setUstaRating(updated.ustaRating ?? "");
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't save your details. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  const memberSince = new Date(user.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="profile-page">
      <h1>Profile</h1>

      <section className="profile-summary">
        <h2>
          {user.firstName} {user.lastName}
        </h2>
        <dl className="profile-details">
          <dt>Email</dt>
          <dd>{user.email}</dd>
          <dt>Member since</dt>
          <dd>{memberSince}</dd>
        </dl>
      </section>

      <form onSubmit={handleSubmit}>
        <h2>Your details</h2>
        {error && <p role="alert">{error}</p>}
        {saved && <p role="status">Your details have been updated.</p>}
        <label htmlFor="profile-first-name">First name</label>
        <input
          id="profile-first-name"
          autoComplete="given-name"
          value={firstName}
          onChange={(e) => {
            setFirstName(e.target.value);
            setSaved(false);
          }}
        />
        <label htmlFor="profile-last-name">Last name</label>
        <input
          id="profile-last-name"
          autoComplete="family-name"
          value={lastName}
          onChange={(e) => {
            setLastName(e.target.value);
            setSaved(false);
          }}
        />
        {canSetRating && (
          <>
            <label htmlFor="profile-usta-rating">USTA rating</label>
            <select
              id="profile-usta-rating"
              aria-describedby="profile-usta-rating-hint"
              value={ustaRating}
              onChange={(e) => {
                setUstaRating(e.target.value);
                setSaved(false);
              }}
            >
              <option value="">No rating</option>
              {USTA_RATINGS.map((rating) => (
                <option key={rating} value={rating}>
                  {rating}
                </option>
              ))}
            </select>
            <small id="profile-usta-rating-hint">
              Shown next to your name on the ladder. Update it when your NTRP rating changes.
            </small>
          </>
        )}
        <button type="submit" disabled={saving || unchanged}>
          {saving ? "Saving…" : "Save"}
        </button>
      </form>

      {/* The phone-number section is deliberately not rendered yet: the club's toll-free number
          isn't carrier-verified, so a code entered here wouldn't be delivered. Everything behind
          it is in place — PhoneNumberSection, the API, and User.phoneNumber — so switching it back
          on is restoring this one line and its import:
          <PhoneNumberSection phoneNumber={user.phoneNumber} onChange={updateUser} /> */}

      <AddressesSection />
    </div>
  );
}
