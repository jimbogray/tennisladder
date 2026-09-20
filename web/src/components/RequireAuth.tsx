import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";

/**
 * `allowIncompleteProfile` is for the one route a Google-first signup can reach before it has
 * redeemed an invite code; everywhere else sends it there, matching the API, which refuses those
 * accounts with a 403 until the profile is finished.
 */
export function RequireAuth({
  children,
  allowIncompleteProfile = false,
}: {
  children: ReactNode;
  allowIncompleteProfile?: boolean;
}) {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.profileCompletedAt && !allowIncompleteProfile) {
    return <Navigate to="/complete-profile" replace />;
  }
  return <>{children}</>;
}
