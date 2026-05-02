import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  ShoppingBasket,
  Package,
  ChefHat,
  Shield,
  BarChart2,
  Bell,
  Activity,
  ClipboardList,
  LogOut,
  ChevronRight,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/", icon: LayoutDashboard, label: "Overview" },
  { href: "/users", icon: Users, label: "Users" },
  { href: "/pantry", icon: ShoppingBasket, label: "Pantry Ops" },
  { href: "/products", icon: Package, label: "Products" },
  { href: "/recipes", icon: ChefHat, label: "Recipes" },
  { href: "/moderation", icon: Shield, label: "Moderation" },
  { href: "/analytics", icon: BarChart2, label: "Analytics" },
  { href: "/notifications", icon: Bell, label: "Notifications" },
  { href: "/system", icon: Activity, label: "System Health" },
  { href: "/audit", icon: ClipboardList, label: "Audit Log" },
];

interface SidebarProps {
  user: { email: string; username: string } | null;
  onLogout: () => void;
}

export function Sidebar({ user, onLogout }: SidebarProps) {
  const [location] = useLocation();

  return (
    <aside className="w-64 min-h-screen bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border shrink-0">
      <div className="px-6 py-5 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-sidebar-primary flex items-center justify-center">
            <ChefHat className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold leading-none">Pick & Cook</p>
            <p className="text-xs text-sidebar-foreground/50 mt-0.5">Ops Dashboard</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
            const active = href === "/" ? location === "/" : location.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors group",
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1">{label}</span>
                  {active && <ChevronRight className="w-3 h-3 opacity-60" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="px-3 py-4 border-t border-sidebar-border">
        <div className="px-3 py-2 mb-1">
          <p className="text-xs font-medium truncate">{user?.username ?? "Admin"}</p>
          <p className="text-xs text-sidebar-foreground/50 truncate">{user?.email}</p>
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors w-full"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
