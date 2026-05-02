import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/query-client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Activity } from "lucide-react";

interface Props {
  user: { id: string; email: string; username: string; role: string; createdAt?: string } | null;
  onClose: () => void;
}

interface TimelineEvent {
  id: string;
  source: "user_events" | "analytics_events";
  eventName: string;
  eventCategory: string | null;
  metadata: unknown;
  createdAt: string;
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function UserDetailDrawer({ user, onClose }: Props) {
  const userId = user?.id ?? "";
  const timelineQuery = useQuery({
    queryKey: ["ops", "user-timeline", userId],
    queryFn: () =>
      apiFetch(`/api/ops/users/${userId}/timeline?limit=100`).then(
        (r) => r.json() as Promise<{ events: TimelineEvent[]; total: number }>
      ),
    enabled: !!userId,
  });

  const events = timelineQuery.data?.events ?? [];

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-2xl max-h-[80vh] overflow-y-auto"
        data-testid="drawer-user-detail"
      >
        <DialogHeader>
          <DialogTitle data-testid="text-user-username">
            {user?.username ?? "User"}
          </DialogTitle>
          <DialogDescription>
            {user?.email} · {user?.role} · joined{" "}
            {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Recent activity timeline
            <span className="text-xs text-muted-foreground font-normal">
              ({timelineQuery.data?.total ?? 0} events)
            </span>
          </h3>

          {timelineQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-10 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : events.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No events recorded for this user yet.
            </p>
          ) : (
            <ul className="space-y-1" data-testid="list-timeline-events">
              {events.map((ev) => (
                <li
                  key={`${ev.source}-${ev.id}`}
                  className="flex items-start gap-2 py-1.5 border-b border-border text-xs last:border-0"
                  data-testid={`event-${ev.id}`}
                >
                  <span
                    className={
                      ev.source === "user_events"
                        ? "w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0"
                        : "w-1.5 h-1.5 rounded-full bg-muted-foreground mt-1.5 shrink-0"
                    }
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-medium">{ev.eventName}</span>
                      {ev.eventCategory && (
                        <span className="text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground">
                          {ev.eventCategory}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {ev.source === "user_events" ? "user_event" : "analytics"}
                      </span>
                    </div>
                    {ev.metadata != null && Object.keys((ev.metadata as Record<string, unknown>) ?? {}).length > 0 && (
                      <pre className="text-[10px] text-muted-foreground mt-0.5 truncate">
                        {JSON.stringify(ev.metadata)}
                      </pre>
                    )}
                  </div>
                  <span
                    className="text-muted-foreground text-[10px] shrink-0"
                    title={new Date(ev.createdAt).toLocaleString()}
                  >
                    {relTime(ev.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
