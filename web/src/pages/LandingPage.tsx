import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";

export function LandingPage() {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;
  if (user) return <Navigate to="/ladder" replace />;

  return (
    <div>
      <h1>Tennis Ladder</h1>
      <p>Log in or sign up to view the ladder.</p>
      <Link to="/login">Log in</Link>
      <Link to="/signup">Sign up</Link>
    </div>
  );
}
