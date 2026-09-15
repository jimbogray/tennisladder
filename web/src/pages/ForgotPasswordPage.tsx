import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { requestPasswordReset } from "../api/auth.js";
import { ApiError } from "../api/client.js";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [expiresInMinutes, setExpiresInMinutes] = useState<number | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await requestPasswordReset(email);
      setExpiresInMinutes(result.expiresInMinutes);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        {expiresInMinutes !== null ? (
          <>
            <h1>Check your email</h1>
            {/* Deliberately doesn't confirm the account exists — the API won't say either. */}
            <p>
              If there's an account for <strong>{email}</strong>, we've sent it a link to choose a new
              password. The link expires in {expiresInMinutes} minutes.
            </p>
            <p>Nothing there? Check your spam folder, or wait a minute and try again.</p>
            <p>
              <Link to="/login">Back to log in</Link>
            </p>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <h1>Forgot password</h1>
            {error && <p role="alert">{error}</p>}
            <input
              type="email"
              placeholder="Email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <small>We'll email you a link to choose a new password.</small>
            <button type="submit" disabled={submitting}>
              {submitting ? "Sending…" : "Send reset link"}
            </button>
            <p>
              <Link to="/login">Back to log in</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
