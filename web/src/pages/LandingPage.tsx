import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";

export function LandingPage() {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;
  if (user) return <Navigate to="/ladder" replace />;

  return (
    <div className="auth-page">
      <h1>Tennis Ladder</h1>
      <p>Log in or register to view the ladder.</p>
      <div className="auth-links">
        <Link to="/login">Log in</Link>
        <Link to="/register">Register</Link>
      </div>
    </div>
  );
}
