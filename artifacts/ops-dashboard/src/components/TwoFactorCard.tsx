import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/query-client";
import { ShieldCheck, ShieldOff, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TotpStatus {
  enabled: boolean;
  enabledAt: string | null;
  lastVerifiedAt: string | null;
}

interface SetupResponse {
  secret: string;
  otpauthUri: string;
  issuer: string;
}

export function TwoFactorCard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [setup, setSetup] = useState<SetupResponse | null>(null);
  const [code, setCode] = useState("");
  const [disableCode, setDisableCode] = useState("");

  const statusQuery = useQuery<TotpStatus>({
    queryKey: ["ops", "auth", "2fa", "status"],
    queryFn: () => apiFetch("/api/ops/auth/2fa/status").then((r) => r.json()),
  });

  const startSetup = useMutation({
    mutationFn: () =>
      apiFetch("/api/ops/auth/2fa/setup", { method: "POST" }).then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error ?? `HTTP ${r.status}`);
        }
        return r.json() as Promise<SetupResponse>;
      }),
    onSuccess: (data) => setSetup(data),
    onError: (e: Error) =>
      toast({ title: "Setup failed", description: e.message, variant: "destructive" }),
  });

  const verifySetup = useMutation({
    mutationFn: (c: string) =>
      apiFetch("/api/ops/auth/2fa/verify-setup", {
        method: "POST",
        body: JSON.stringify({ code: c }),
      }).then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error ?? `HTTP ${r.status}`);
        }
        return r.json();
      }),
    onSuccess: () => {
      toast({ title: "Two-factor enabled", description: "You'll be asked for a code on next login." });
      setSetup(null);
      setCode("");
      qc.invalidateQueries({ queryKey: ["ops", "auth", "2fa", "status"] });
      qc.invalidateQueries({ queryKey: ["ops", "auth", "me"] });
    },
    onError: (e: Error) =>
      toast({ title: "Verification failed", description: e.message, variant: "destructive" }),
  });

  const disable = useMutation({
    mutationFn: (c: string) =>
      apiFetch("/api/ops/auth/2fa/disable", {
        method: "POST",
        body: JSON.stringify({ code: c }),
      }).then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error ?? `HTTP ${r.status}`);
        }
        return r.json();
      }),
    onSuccess: () => {
      toast({ title: "Two-factor disabled" });
      setDisableCode("");
      qc.invalidateQueries({ queryKey: ["ops", "auth", "2fa", "status"] });
    },
    onError: (e: Error) =>
      toast({ title: "Disable failed", description: e.message, variant: "destructive" }),
  });

  const enabled = statusQuery.data?.enabled ?? false;

  return (
    <div className="bg-card border border-card-border rounded-lg p-5 shadow-sm" data-testid="two-factor-card">
      <div className="flex items-center gap-2 mb-3">
        {enabled ? (
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
        ) : (
          <ShieldOff className="w-4 h-4 text-muted-foreground" />
        )}
        <h3 className="text-sm font-semibold">Two-factor authentication</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Optional TOTP via Google Authenticator / 1Password / Authy. Required for your account on next login once enabled.
      </p>

      {statusQuery.isLoading ? (
        <div className="h-10 bg-muted rounded animate-pulse" />
      ) : enabled ? (
        <div className="space-y-3">
          <p className="text-sm text-emerald-700 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            Enabled {statusQuery.data?.enabledAt ? `since ${new Date(statusQuery.data.enabledAt).toLocaleDateString()}` : ""}
          </p>
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Confirm with current code to disable</label>
              <input
                type="text"
                inputMode="numeric"
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                data-testid="input-disable-totp-code"
              />
            </div>
            <button
              onClick={() => disable.mutate(disableCode)}
              disabled={disable.isPending || disableCode.length !== 6}
              className="px-3 py-2 rounded bg-destructive text-destructive-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50"
              data-testid="disable-totp"
            >
              Disable
            </button>
          </div>
        </div>
      ) : setup ? (
        <div className="space-y-3">
          <div className="rounded-md border border-border bg-muted/40 p-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">Add this to your authenticator app:</p>
            <p className="font-mono text-xs break-all text-foreground" data-testid="totp-secret">{setup.secret}</p>
            <p className="text-xs text-muted-foreground mt-2">otpauth URI:</p>
            <p className="font-mono text-xs break-all text-muted-foreground">{setup.otpauthUri}</p>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Enter 6-digit code from app</label>
              <input
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                data-testid="input-verify-totp-code"
              />
            </div>
            <button
              onClick={() => verifySetup.mutate(code)}
              disabled={verifySetup.isPending || code.length !== 6}
              className="px-3 py-2 rounded bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50"
              data-testid="verify-totp-setup"
            >
              {verifySetup.isPending ? "Verifying…" : "Verify & enable"}
            </button>
            <button
              onClick={() => { setSetup(null); setCode(""); }}
              className="px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => startSetup.mutate()}
          disabled={startSetup.isPending}
          className="inline-flex items-center gap-2 px-4 py-2 rounded bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
          data-testid="start-totp-setup"
        >
          {startSetup.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Set up two-factor
        </button>
      )}
    </div>
  );
}
