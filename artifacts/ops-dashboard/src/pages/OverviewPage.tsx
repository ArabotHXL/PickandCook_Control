import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/query-client";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Users, ShoppingBasket, ChefHat, Activity, Scan, Shield, TrendingUp, Clock } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";

function useMetrics() {
  return useQuery({
    queryKey: ["ops", "overview", "metrics"],
    queryFn: () => apiFetch("/api/ops/overview/metrics").then((r) => r.json()),
    refetchInterval: 60_000,
  });
}

function useFunnel(days = 30) {
  return useQuery({
    queryKey: ["ops", "overview", "funnel", days],
    queryFn: () => apiFetch(`/api/ops/overview/funnel?days=${days}`).then((r) => r.json()),
  });
}

export function OverviewPage() {
  const { data: metrics, isLoading } = useMetrics();
  const { data: funnelData } = useFunnel(30);

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-28 bg-muted rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const m = metrics ?? {};

  const topCards = [
    { key: "totalUsers", icon: <Users className="w-4 h-4" /> },
    { key: "newUsers7d", icon: <TrendingUp className="w-4 h-4" /> },
    { key: "activeUsers7d", icon: <Activity className="w-4 h-4" /> },
    { key: "cookSessions", icon: <ChefHat className="w-4 h-4" /> },
    { key: "pantryItemsCreated", icon: <ShoppingBasket className="w-4 h-4" /> },
    { key: "avgPantryItemsPerUser", icon: <ShoppingBasket className="w-4 h-4" /> },
    { key: "barcodeScans", icon: <Scan className="w-4 h-4" /> },
    { key: "pendingModeration", icon: <Shield className="w-4 h-4" /> },
  ];

  const funnelSteps = funnelData?.steps ?? [];

  return (
    <div>
      <PageHeader title="Overview" description="Platform health and key metrics" />

      <div className="p-6 space-y-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {topCards.map(({ key, icon }) => {
            const card = m[key];
            if (!card) return null;
            return (
              <StatCard
                key={key}
                label={card.label}
                value={card.value}
                trend={card.trend}
                icon={icon}
              />
            );
          })}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-card border border-card-border rounded-lg p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground mb-4">User Behavior Funnel (30d)</h3>
            {funnelSteps.length === 0 ? (
              <p className="text-sm text-muted-foreground">No funnel data available</p>
            ) : (
              <div className="space-y-2">
                {funnelSteps.map((step: { step: number; label: string; count: number; conversionFromPrev?: number; dropOff?: number }) => {
                  const maxCount = funnelSteps[0]?.count ?? 1;
                  const pct = maxCount > 0 ? (step.count / maxCount) * 100 : 0;
                  return (
                    <div key={step.step} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-foreground font-medium">{step.label}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {step.count.toLocaleString()}
                          {step.conversionFromPrev != null && (
                            <span className="ml-2 text-emerald-600">{step.conversionFromPrev}%</span>
                          )}
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-card border border-card-border rounded-lg p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground mb-4">Funnel Drop-off</h3>
            {funnelSteps.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data available</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={funnelSteps} margin={{ top: 4, right: 4, bottom: 4, left: -10 }}>
                  <XAxis dataKey="step" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(val: number) => [val.toLocaleString(), "Users"]}
                    labelFormatter={(l) => `Step ${l}`}
                  />
                  <Bar dataKey="count" fill="hsl(224 76% 57%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { key: "savedRecipes", icon: <ChefHat className="w-4 h-4" /> },
            { key: "recipeViews", icon: <Activity className="w-4 h-4" /> },
            { key: "shoppingActions", icon: <ShoppingBasket className="w-4 h-4" /> },
            { key: "unknownBarcodeScans", icon: <Scan className="w-4 h-4" /> },
          ].map(({ key, icon }) => {
            const card = m[key];
            if (!card) return null;
            return (
              <StatCard key={key} label={card.label} value={card.value} trend={card.trend} icon={icon} />
            );
          })}
        </div>
      </div>
    </div>
  );
}
