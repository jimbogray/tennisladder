import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { resetPassword } from "../api/auth.js";

export function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await resetPassword(token!, password);
    setDone(true);
  }

  if (done) return <p>Password updated. You can now log in.</p>;

  return (
    <form onSubmit={handleSubmit}>
      <h1>Reset password</h1>
      <input
        type="password"
        placeholder="New password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button type="submit">Set new password</button>
    </form>
  );
}
