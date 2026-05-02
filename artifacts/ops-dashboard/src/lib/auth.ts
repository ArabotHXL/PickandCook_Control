const TOKEN_KEY = "ops_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function getAuthHeader(): { Authorization: string } | Record<string, never> {
  const token = getToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}
