import { requireAuth } from "@/lib/auth";
import { AdminDashboard } from "./_views/admin";
import { LegacyDashboard } from "./_views/legacy";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireAuth();
  if (session.role === "admin") {
    return <AdminDashboard userName={session.name ?? "관리자"} />;
  }
  // PR3에서 coordinator/professor 전용 뷰로 교체 예정.
  return <LegacyDashboard />;
}
