import { createContext, useEffect, useState, type ReactNode } from "react";
import type { SessionUserDto } from "@tennisladder/shared";
import { logout as logoutRequest, refreshSession } from "../api/auth.js";
import { setAccessToken } from "../api/client.js";

export interface AuthContextValue {
  user: SessionUserDto | null;
  isLoading: boolean;
  setSession: (user: SessionUserDto, accessToken: string) => void;
  /** Replaces the signed-in user's details (e.g. after a profile edit) without touching the token. */
  updateUser: (user: SessionUserDto) => void;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUserDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Mint a fresh access token from the httpOnly refresh cookie on load, since the access
    // token itself only ever lives in memory and is lost on a full page reload.
    refreshSession()
      .then((res) => {
        setAccessToken(res.accessToken);
        setUser(res.user);
      })
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  function setSession(nextUser: SessionUserDto, accessToken: string) {
    setAccessToken(accessToken);
    setUser(nextUser);
  }

  async function logout() {
    await logoutRequest().catch(() => undefined);
    setAccessToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, setSession, updateUser: setUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
