import { useState, useEffect, useCallback } from "react";
import { getToken, setToken, clearToken } from "@/lib/auth";
import { apiFetch } from "@/lib/query-client";

export interface AdminUser {
  id: string;
  email: string;
  username: string;
  role: string;
  totpEnabled?: boolean;
}

/** Result of `login()`: either a complete session, or a challenge requiring TOTP. */
export type LoginResult =
  | { kind: "session"; user: AdminUser }
  | { kind: "totp_required"; challengeToken: string };

export function useAuth() {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    const token = getToken();
    if (!token) { setLoading(false); return; }
    try {
      const res = await apiFetch("/api/ops/auth/me");
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      } else {
        clearToken();
        setUser(null);
      }
    } catch {
      clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMe(); }, [fetchMe]);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    const res = await apiFetch("/api/ops/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? "Login failed");
    }
    const data = await res.json();
    if (data.needsTotp && data.challengeToken) {
      return { kind: "totp_required", challengeToken: data.challengeToken };
    }
    setToken(data.token);
    setUser(data.user);
    return { kind: "session", user: data.user };
  }, []);

  const verifyTotpLogin = useCallback(async (challengeToken: string, code: string): Promise<AdminUser> => {
    const res = await apiFetch("/api/ops/auth/2fa/verify-login", {
      method: "POST",
      body: JSON.stringify({ challengeToken, code }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? "TOTP verification failed");
    }
    const data = await res.json();
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  return { user, loading, login, logout, verifyTotpLogin };
}
