import { requireAuth } from "@/lib/auth";
import { AdminDashboard } from "./_views/admin";
import { CoordinatorDashboard } from "./_views/coordinator";
import { ProfessorDashboard } from "./_views/professor";
import { LegacyDashboard } from "./_views/legacy";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireAuth();
  const userName = session.name ?? "사용자";
  if (session.role === "admin") {
    return <AdminDashboard userName={userName} />;
  }
  if (session.teamId) {
    if (session.role === "coordinator") return <CoordinatorDashboard userName={userName} teamId={session.teamId} />;
    if (session.role === "professor") return <ProfessorDashboard userName={userName} teamId={session.teamId} />;
  }
  return <LegacyDashboard />;
}
