import { apiFetch } from "./query-client";
import { getToken, setToken, clearToken } from "./auth";

export { getToken, setToken, clearToken };

export async function login(email: string, password: string) {
  const res = await apiFetch("/api/ops/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error("Invalid credentials");
  return res.json();
}

export function logout() {
  clearToken();
  window.location.href = import.meta.env.BASE_URL;
}
