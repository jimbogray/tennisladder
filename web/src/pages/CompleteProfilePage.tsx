import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { USTA_RATINGS, type UstaRating } from "@tennisladder/shared";
import { completeProfile } from "../api/auth.js";
import { ApiError } from "../api/client.js";
import { useAuth } from "../hooks/useAuth.js";

/**
 * Where a Google signup lands: the account exists, but until an invite code is redeemed it has no
 * place on the ladder and the API refuses everything else. Registering with a password collects
 * the same two things up front, so this page only exists for the Google route.
 */
export function CompleteProfilePage() {
  const { user, setSession, logout } = useAuth();
  const [registrationCode, setRegistrationCode] = useState("");
  const [ustaRating, setUstaRating] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const { user: updated, accessToken } = await completeProfile({
        registrationCode,
        ustaRating: ustaRating === "" ? null : (ustaRating as UstaRating),
      });
      // The code may have just made this an admin account, so the new token matters.
      setSession(updated, accessToken);
      navigate("/ladder");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't finish setting up. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <form onSubmit={handleSubmit}>
          <h1>Finish signing up</h1>
          <p>
            {user ? `You're signed in as ${user.email}. ` : ""}
            Your club admin gives out a 4-digit code that adds you to the team.
          </p>
          {error && <p role="alert">{error}</p>}

          <label htmlFor="complete-registration-code">Registration code</label>
          <input
            id="complete-registration-code"
            inputMode="numeric"
            maxLength={4}
            autoFocus
            value={registrationCode}
            onChange={(e) => setRegistrationCode(e.target.value.replace(/\D/g, ""))}
          />

          <label htmlFor="complete-usta-rating">USTA rating</label>
          <select
            id="complete-usta-rating"
            value={ustaRating}
            onChange={(e) => setUstaRating(e.target.value)}
          >
            <option value="">No rating</option>
            {USTA_RATINGS.map((rating) => (
              <option key={rating} value={rating}>
                {rating}
              </option>
            ))}
          </select>
          <small>You can change this later on your profile.</small>

          <button type="submit" disabled={saving || registrationCode.length !== 4}>
            {saving ? "Setting up…" : "Join the team"}
          </button>
          <p>
            {/* Without this, an account waiting on a code has no way out but clearing cookies. */}
            <button type="button" className="link-button" onClick={() => logout().then(() => navigate("/login"))}>
              Sign out
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
