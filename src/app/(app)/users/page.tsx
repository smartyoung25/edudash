import { requireRole } from "@/lib/auth";
import { db, schema } from "@/db/client";
import { PageHeader } from "@/components/page-header";
import { UsersClient } from "./users-client";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  await requireRole(["admin"]);

  const [users, teams] = await Promise.all([
    db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        role: schema.users.role,
        teamId: schema.users.teamId,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
      .orderBy(schema.users.id),
    db.select({ id: schema.teams.id, name: schema.teams.name }).from(schema.teams).orderBy(schema.teams.name),
  ]);

  return (
    <div>
      <PageHeader title="사용자 관리" description={`총 ${users.length}명 · 추가·역할 변경·비밀번호 초기화·삭제`} />
      <div className="p-6">
        <UsersClient initialUsers={users} teams={teams} />
      </div>
    </div>
  );
}
