import { useState } from "react";
import { ChefHat, Loader2, ShieldCheck } from "lucide-react";
import type { LoginResult, AdminUser } from "@/hooks/useAuth";

interface LoginPageProps {
  onLogin: (email: string, password: string) => Promise<LoginResult>;
  onVerifyTotp: (challengeToken: string, code: string) => Promise<AdminUser>;
}

export function LoginPage({ onLogin, onVerifyTotp }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await onLogin(email, password);
      if (result.kind === "totp_required") {
        setChallengeToken(result.challengeToken);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challengeToken) return;
    setError(null);
    setLoading(true);
    try {
      await onVerifyTotp(challengeToken, code.trim());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const cancelTotp = () => {
    setChallengeToken(null);
    setCode("");
    setError(null);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center mb-4">
            <ChefHat className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Pick &amp; Cook Ops</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in to admin dashboard</p>
        </div>

        {!challengeToken ? (
          <form onSubmit={submitCredentials} className="bg-card border border-card-border rounded-xl p-6 shadow-md space-y-4">
            {error && (
              <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-md px-3 py-2">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                required
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Sign in
            </button>
          </form>
        ) : (
          <form onSubmit={submitCode} className="bg-card border border-card-border rounded-xl p-6 shadow-md space-y-4">
            <div className="flex items-center gap-2 text-foreground">
              <ShieldCheck className="w-5 h-5 text-primary" />
              <h2 className="text-base font-semibold">Two-factor verification</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Enter the 6-digit code from your authenticator app to finish signing in.
            </p>

            {error && (
              <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-md px-3 py-2">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Authenticator code</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                autoFocus
                required
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-lg font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Verify and sign in
            </button>
            <button
              type="button"
              onClick={cancelTotp}
              className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
