import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface StatCardProps {
  label: string;
  value: number | string;
  trend?: number | null;
  className?: string;
  icon?: React.ReactNode;
  description?: string;
}

export function StatCard({ label, value, trend, className, icon, description }: StatCardProps) {
  const trendUp = trend != null && trend > 0;
  const trendDown = trend != null && trend < 0;

  return (
    <div className={cn("bg-card border border-card-border rounded-lg p-5 shadow-sm", className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground font-medium truncate">{label}</p>
          <p className="text-2xl font-bold text-foreground mt-1 tabular-nums">
            {typeof value === "number" ? value.toLocaleString() : value}
          </p>
          {description && (
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
          )}
        </div>
        {icon && (
          <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center text-primary shrink-0">
            {icon}
          </div>
        )}
      </div>
      {trend != null && (
        <div className={cn("flex items-center gap-1 mt-3 text-xs font-medium",
          trendUp ? "text-emerald-600" : trendDown ? "text-destructive" : "text-muted-foreground"
        )}>
          {trendUp ? <TrendingUp className="w-3.5 h-3.5" /> : trendDown ? <TrendingDown className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
          <span>{Math.abs(trend)}% vs prev period</span>
        </div>
      )}
    </div>
  );
}
