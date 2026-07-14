import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../api/auth.js";
import { useAuth } from "../hooks/useAuth.js";
import { ApiError } from "../api/client.js";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
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
    <form onSubmit={handleSubmit}>
      <h1>Log in</h1>
      {error && <p role="alert">{error}</p>}
      <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button type="submit">Log in</button>
      {/* TODO: "Continue with Google" button linking to GET /api/auth/google */}
    </form>
  );
}
