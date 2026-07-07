import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { register } from "../api/auth.js";
import { useAuth } from "../hooks/useAuth.js";

export function SignupPage() {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    ustaRating: "",
    registrationCode: "",
  });
  const { setSession } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // TODO: surface validation errors (e.g. invalid/expired/used registration code) in the UI.
    try {
      const { user, accessToken } = await register(form);
      setSession(user, accessToken);
      navigate("/ladder");
    } catch (err) {
      console.error(err);
    }
  }

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>Sign up</h1>
      <input placeholder="First name" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} />
      <input placeholder="Last name" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
      <input type="email" placeholder="Email" value={form.email} onChange={(e) => set("email", e.target.value)} />
      <input
        type="password"
        placeholder="Password"
        value={form.password}
        onChange={(e) => set("password", e.target.value)}
      />
      <input
        placeholder="USTA rating"
        value={form.ustaRating}
        onChange={(e) => set("ustaRating", e.target.value)}
      />
      <input
        placeholder="Registration code"
        maxLength={4}
        value={form.registrationCode}
        onChange={(e) => set("registrationCode", e.target.value)}
      />
      <button type="submit">Sign up</button>
      {/* TODO: "Continue with Google" button linking to GET /api/auth/google */}
    </form>
  );
}
