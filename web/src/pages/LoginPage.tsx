import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { login } from "../api/auth.js";
import { useAuth } from "../hooks/useAuth.js";
import { ApiError } from "../api/client.js";
import { PasswordInput } from "../components/PasswordInput.js";
import { GoogleSignInButton } from "../components/GoogleSignInButton.js";

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // A failed Google sign-in comes back as a redirect to /login?error=…, since the callback has
  // no page of its own to report on.
  const [error, setError] = useState<string | null>(searchParams.get("error"));
  const { setSession } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const { user, accessToken } = await login({ email, password });
      setSession(user, accessToken);
      navigate("/ladder");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed. Please try again.");
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <form onSubmit={handleSubmit}>
          <h1>Log in</h1>
          {error && <p role="alert">{error}</p>}
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <PasswordInput
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit">Log in</button>
          <GoogleSignInButton label="Continue with Google" />
          <p>
            <Link to="/forgot-password">Forgot password?</Link>
          </p>
          <p>
            <Link to="/register">Register</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
