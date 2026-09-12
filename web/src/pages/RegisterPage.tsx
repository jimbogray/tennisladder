import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { register } from "../api/auth.js";
import { useAuth } from "../hooks/useAuth.js";
import { ApiError } from "../api/client.js";

// USTA NTRP ratings run from 2.5 to 7.0 in 0.5 increments.
const USTA_RATINGS = Array.from({ length: 10 }, (_, i) => (2.5 + i * 0.5).toFixed(1));

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
  const [error, setError] = useState<string | null>(null);
  const { setSession } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const { user, accessToken } = await register(form);
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
            maxLength={4}
            aria-describedby="registration-code-hint"
            value={form.registrationCode}
            onChange={(e) => set("registrationCode", e.target.value.replace(/\D/g, ""))}
          />
          <small id="registration-code-hint">4-digit code from your club admin.</small>
          <button type="submit">Register</button>
          {/* TODO: "Continue with Google" button linking to GET /api/auth/google */}
          <p>
            Already have an account? <Link to="/login">Log in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
