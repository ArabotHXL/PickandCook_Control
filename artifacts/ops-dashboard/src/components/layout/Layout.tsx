import { Sidebar } from "./Sidebar";
import type { AdminUser } from "@/hooks/useAuth";

interface LayoutProps {
  user: AdminUser | null;
  onLogout: () => void;
  children: React.ReactNode;
}

export function Layout({ user, onLogout, children }: LayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar user={user} onLogout={onLogout} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
