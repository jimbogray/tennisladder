import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { resetPassword } from "../api/auth.js";
import { ApiError } from "../api/client.js";

// Mirrors the API's password rule, so the obvious mistake is caught before a round trip.
const MIN_PASSWORD_LENGTH = 8;

export function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword(token!, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        {done ? (
          <>
            <h1>Password updated</h1>
            <p>Your new password is set, and you've been signed out on any other devices.</p>
            <p>
              <Link to="/login">Log in</Link>
            </p>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <h1>Choose a new password</h1>
            {error && <p role="alert">{error}</p>}
            <input
              type="password"
              placeholder="New password"
              autoComplete="new-password"
              aria-describedby="new-password-hint"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <small id="new-password-hint">At least {MIN_PASSWORD_LENGTH} characters.</small>
            <input
              type="password"
              placeholder="Confirm new password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Set new password"}
            </button>
            <p>
              Link expired? <Link to="/forgot-password">Request a new one</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
