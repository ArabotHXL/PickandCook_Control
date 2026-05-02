import { Sidebar } from "./Sidebar";
import type { AdminUser } from "@/hooks/useAuth";

interface LayoutProps {
  user: AdminUser | null;
  onLogout: () => void;
  children: React.ReactNode;
}

export function Layout({ user, onLogout, children }: LayoutProps) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar user={user} onLogout={onLogout} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
