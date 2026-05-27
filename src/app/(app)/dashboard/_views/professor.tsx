import { ScopedDashboard } from "./scoped";

export async function ProfessorDashboard({ userName, teamId }: { userName: string; teamId: number }) {
  return <ScopedDashboard userName={userName} teamId={teamId} roleLabel="주임교수" />;
}
