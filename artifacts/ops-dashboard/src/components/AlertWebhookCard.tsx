import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/query-client";
import { Bell, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SystemFlags {
  scopes: Array<{ id: string; flags: Record<string, unknown> }>;
}

interface AlertWebhookCardProps {
  flagsData?: SystemFlags;
  flagsLoading: boolean;
}

export function AlertWebhookCard({ flagsData, flagsLoading }: AlertWebhookCardProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const systemScope = flagsData?.scopes?.find((s) => s.id === "system");
  const currentUrl = (systemScope?.flags?.alert_webhook_url as string | null) ?? "";
  const enabled = (systemScope?.flags?.alert_webhook_enabled as boolean | undefined) ?? false;

  const [draftUrl, setDraftUrl] = useState<string | null>(null);
  const url = draftUrl ?? currentUrl;

  const updateFlag = useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) =>
      apiFetch("/api/ops/system/flags/system", {
        method: "PATCH",
        body: JSON.stringify({ key, value }),
      }).then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error ?? `HTTP ${r.status}`);
        }
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ops", "system", "flags"] });
      setDraftUrl(null);
    },
    onError: (e: Error) =>
      toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const sendTest = useMutation({
    mutationFn: () =>
      apiFetch("/api/ops/system/alerts/test", { method: "POST" }).then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error ?? `HTTP ${r.status}`);
        }
        return r.json();
      }),
    onSuccess: (result: { delivered: boolean; reason?: string; status?: number }) => {
      if (result.delivered) {
        toast({ title: "Test alert sent", description: `Webhook responded ${result.status}.` });
      } else {
        toast({
          title: "Alert not delivered",
          description: result.reason ?? "unknown reason",
          variant: "destructive",
        });
      }
    },
    onError: (e: Error) =>
      toast({ title: "Test failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="bg-card border border-card-border rounded-lg p-5 shadow-sm" data-testid="alert-webhook-card">
      <div className="flex items-center gap-2 mb-3">
        <Bell className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Alert webhook</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Slack-compatible incoming webhook. Job failures and the AI cost threshold post here.
      </p>

      {flagsLoading ? (
        <div className="space-y-2">
          <div className="h-9 bg-muted rounded animate-pulse" />
          <div className="h-8 bg-muted rounded animate-pulse w-32" />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Webhook URL</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setDraftUrl(e.target.value)}
              placeholder="https://hooks.slack.com/services/…"
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono"
              data-testid="input-webhook-url"
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => updateFlag.mutate({ key: "alert_webhook_enabled", value: e.target.checked })}
                disabled={updateFlag.isPending || !currentUrl}
                className="cursor-pointer"
                data-testid="toggle-webhook-enabled"
              />
              <span className="text-foreground">Enabled</span>
              {!currentUrl && <span className="text-xs text-muted-foreground">(save URL first)</span>}
            </label>

            <div className="flex items-center gap-2">
              {draftUrl !== null && draftUrl !== currentUrl && (
                <>
                  <button
                    onClick={() => setDraftUrl(null)}
                    className="px-3 py-1.5 rounded border border-border text-xs text-muted-foreground hover:bg-muted"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => updateFlag.mutate({ key: "alert_webhook_url", value: draftUrl || null })}
                    disabled={updateFlag.isPending}
                    className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50"
                    data-testid="save-webhook-url"
                  >
                    {updateFlag.isPending ? "Saving…" : "Save URL"}
                  </button>
                </>
              )}
              <button
                onClick={() => sendTest.mutate()}
                disabled={sendTest.isPending || !enabled || !currentUrl}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-input bg-background text-xs font-medium hover:bg-muted disabled:opacity-40"
                data-testid="send-test-alert"
              >
                <Send className="w-3.5 h-3.5" />
                {sendTest.isPending ? "Sending…" : "Send test"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
