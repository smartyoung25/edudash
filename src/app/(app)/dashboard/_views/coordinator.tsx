import { ScopedDashboard } from "./scoped";

export async function CoordinatorDashboard({ userName, teamId }: { userName: string; teamId: number }) {
  return <ScopedDashboard userName={userName} teamId={teamId} roleLabel="코디네이터" />;
}
