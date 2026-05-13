import { db, schema } from "@/db/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { Phone, Mail, GraduationCap, Building2 } from "lucide-react";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  await requireRole(["admin"]);
  const contacts = await db.select().from(schema.contacts);
  const teams = await db.select().from(schema.teams);
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  const professors = contacts.filter((c) => c.kind === "professor");
  const internals  = contacts.filter((c) => c.kind === "internal");

  return (
    <div>
      <PageHeader title="연락망" description="주임강사 및 내부 운영인력 연락처 (관리자 전용)" />
      <div className="p-6 space-y-6">
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <GraduationCap className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-semibold">주임강사 ({professors.length}명)</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2 font-medium text-muted-foreground">성명</th>
                <th className="text-left p-2 font-medium text-muted-foreground">담당 팀</th>
                <th className="text-left p-2 font-medium text-muted-foreground">소속</th>
                <th className="text-left p-2 font-medium text-muted-foreground">연락처</th>
                <th className="text-left p-2 font-medium text-muted-foreground">이메일</th>
              </tr>
            </thead>
            <tbody>
              {professors.map((c) => {
                const team = c.teamId ? teamMap.get(c.teamId) : null;
                return (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-2 font-medium">{c.name}</td>
                    <td className="p-2">
                      {team ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Badge variant="outline">{team.cohort}</Badge>
                          {team.name}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="p-2 text-muted-foreground">{c.affiliation ?? "—"}</td>
                    <td className="p-2 font-mono text-xs">
                      <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone ?? "—"}</span>
                    </td>
                    <td className="p-2 font-mono text-xs">
                      <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{c.email ?? "—"}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-semibold">내부 운영인력 ({internals.length}명)</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2 font-medium text-muted-foreground">성명</th>
                <th className="text-left p-2 font-medium text-muted-foreground">역할</th>
                <th className="text-left p-2 font-medium text-muted-foreground">소속</th>
                <th className="text-left p-2 font-medium text-muted-foreground">연락처</th>
                <th className="text-left p-2 font-medium text-muted-foreground">이메일</th>
              </tr>
            </thead>
            <tbody>
              {internals.map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-2 font-medium">{c.name}</td>
                  <td className="p-2">{c.role}</td>
                  <td className="p-2 text-muted-foreground">{c.affiliation ?? "—"}</td>
                  <td className="p-2 font-mono text-xs">{c.phone ?? "—"}</td>
                  <td className="p-2 font-mono text-xs">{c.email ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
