import { requireAuth } from "@/lib/auth";
import { AppSidebar } from "@/components/app-sidebar";
import { GlobalSearch } from "./dashboard/global-search";
import type { Role } from "@/lib/permissions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuth();
  return (
    <div className="flex min-h-screen">
      <AppSidebar role={session.role as Role} name={session.name ?? ""} />
      <main className="flex-1 overflow-x-hidden">
        <GlobalSearch />
        {children}
      </main>
    </div>
  );
}
