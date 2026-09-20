import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { register } from "../api/auth.js";
import { useAuth } from "../hooks/useAuth.js";
import { ApiError } from "../api/client.js";
import { USTA_RATINGS, type CreateUserAddressRequest } from "@tennisladder/shared";
import { GoogleSignInButton } from "../components/GoogleSignInButton.js";
import { SavedAddressForm } from "../components/SavedAddressForm.js";
import { SavedAddressList } from "../components/SavedAddressList.js";

export function RegisterPage() {
  // Invite emails link here as /register?code=1234 so the recipient doesn't have to type it.
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    ustaRating: "",
    registrationCode: (searchParams.get("code") ?? "").replace(/\D/g, "").slice(0, 4),
  });
  // Held locally until the account exists; saved along with it.
  const [addresses, setAddresses] = useState<CreateUserAddressRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { setSession } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const { user, accessToken } = await register({ ...form, addresses });
      setSession(user, accessToken);
      navigate("/ladder");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Register failed. Please try again.");
    }
  }

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <form onSubmit={handleSubmit}>
          <h1>Register</h1>
          {error && <p role="alert">{error}</p>}
          <input placeholder="First name" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} />
          <input placeholder="Last name" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
          <input
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
          />
          <select value={form.ustaRating} onChange={(e) => set("ustaRating", e.target.value)}>
            <option value="">USTA rating</option>
            {USTA_RATINGS.map((rating) => (
              <option key={rating} value={rating}>
                {rating}
              </option>
            ))}
          </select>
          <input
            placeholder="Registration code"
            inputMode="numeric"
            maxLength={6}
            aria-describedby="registration-code-hint"
            value={form.registrationCode}
            onChange={(e) => set("registrationCode", e.target.value.replace(/\D/g, ""))}
          />
          <small id="registration-code-hint">6-digit code from your club admin.</small>
          <div className="register-addresses">
            <h2>Where do you travel from?</h2>
            <small>
              Optional. Save home, office or anywhere else you head to matches from. Only you can
              see these, and you can change them later on your profile.
            </small>
            <SavedAddressList
              addresses={addresses.map((a) => ({ key: a.label, ...a }))}
              onRemove={(label) => setAddresses((prev) => prev.filter((a) => a.label !== label))}
            />
            <SavedAddressForm
              idPrefix="register-address"
              existingLabels={addresses.map((a) => a.label)}
              onAdd={(input) => setAddresses((prev) => [...prev, input])}
            />
          </div>
          <button type="submit">Register</button>
          <GoogleSignInButton label="Sign up with Google" />
          <p>
            Already have an account? <Link to="/login">Log in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
