import { NextResponse } from "next/server";
import { db, schema } from "@/db/client";
import { like, or, sql } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export const runtime = "nodejs";

const LIMIT = 8;

export async function GET(req: Request) {
  await requireAuth();
  const url = new URL(req.url);
  const qRaw = (url.searchParams.get("q") || "").trim();
  if (qRaw.length < 1) return NextResponse.json({ q: qRaw, results: {} });
  const q = `%${qRaw}%`;

  // teams: 팀 정보 캐시 (다른 카테고리에서 teamId → 팀명 조회용)
  const allTeams = await db.select({ id: schema.teams.id, name: schema.teams.name }).from(schema.teams);
  const teamName = new Map(allTeams.map(t => [t.id, t.name]));

  const [teams, members, expenses, agencyExpenses, documents, contacts, sessions, dailyReports] = await Promise.all([
    db.select().from(schema.teams).where(or(
      like(schema.teams.name, q),
      like(schema.teams.courseName, q),
      like(schema.teams.professorName, q),
      like(sql`coalesce(${schema.teams.coordinatorName}, '')`, q),
    )).limit(LIMIT),

    db.select().from(schema.members).where(or(
      like(schema.members.name, q),
      like(sql`coalesce(${schema.members.phone}, '')`, q),
      like(sql`coalesce(${schema.members.email}, '')`, q),
    )).limit(LIMIT),

    db.select().from(schema.expenses).where(or(
      like(sql`coalesce(${schema.expenses.vendorName}, '')`, q),
      like(sql`coalesce(${schema.expenses.memo}, '')`, q),
    )).limit(LIMIT),

    db.select().from(schema.agencyExpenses).where(or(
      like(sql`coalesce(${schema.agencyExpenses.vendorName}, '')`, q),
      like(sql`coalesce(${schema.agencyExpenses.memo}, '')`, q),
      like(sql`coalesce(${schema.agencyExpenses.tripName}, '')`, q),
    )).limit(LIMIT),

    db.select().from(schema.documents).where(or(
      like(schema.documents.fileName, q),
      like(sql`coalesce(${schema.documents.emailSubject}, '')`, q),
    )).limit(LIMIT),

    db.select().from(schema.contacts).where(or(
      like(schema.contacts.name, q),
      like(sql`coalesce(${schema.contacts.role}, '')`, q),
      like(sql`coalesce(${schema.contacts.affiliation}, '')`, q),
    )).limit(LIMIT),

    db.select().from(schema.sessions).where(like(schema.sessions.subject, q)).limit(LIMIT),

    db.select().from(schema.dailyReports).where(or(
      like(sql`coalesce(${schema.dailyReports.subject}, '')`, q),
      like(sql`coalesce(${schema.dailyReports.notes}, '')`, q),
    )).limit(LIMIT),
  ]);

  const results = {
    팀: teams.map(t => ({
      id: t.id, label: t.name,
      detail: `${t.cohort} · ${t.courseName} · ${t.professorName}`,
      href: `/teams/${t.id}`,
    })),
    교육생: members.map(m => ({
      id: m.id, label: m.name,
      detail: `${teamName.get(m.teamId) ?? "팀?"} · ${m.phone ?? "-"} · ${m.eduStatus ?? "교육중"}`,
      href: `/teams/${m.teamId}`,
    })),
    "팀 지출": expenses.map(e => ({
      id: e.id, label: e.vendorName ?? "(거래처 미지정)",
      detail: `${teamName.get(e.teamId) ?? "팀?"} · ${e.category} · ${e.spentDate} · ${e.totalAmount.toLocaleString()}원${e.memo ? ` · ${e.memo.slice(0,30)}` : ""}`,
      href: `/expenses/${e.teamId}`,
    })),
    "기관경비": agencyExpenses.map(a => ({
      id: a.id, label: a.tripName ?? a.vendorName ?? "(미지정)",
      detail: `${a.kind}${a.subcategory ? ` · ${a.subcategory}` : ""} · ${a.spentDate} · ${a.totalAmount.toLocaleString()}원${a.vendorName ? ` · ${a.vendorName}` : ""}`,
      href: `/agency/${encodeURIComponent(a.kind)}`,
    })),
    서류: documents.map(d => ({
      id: d.id, label: d.fileName,
      detail: `${d.docType}${d.teamId ? ` · ${teamName.get(d.teamId) ?? "팀?"}` : ""}${d.month ? ` · ${d.month}월` : ""}`,
      href: `/documents`,
    })),
    연락처: contacts.map(c => ({
      id: c.id, label: c.name,
      detail: `${c.role ?? ""}${c.affiliation ? ` · ${c.affiliation}` : ""}${c.phone ? ` · ${c.phone}` : ""}`,
      href: `/contacts`,
    })),
    차시: sessions.map(s => ({
      id: s.id, label: `${teamName.get(s.teamId) ?? "팀?"} ${s.sessionNo}차시`,
      detail: `${s.subject} · ${s.scheduledDate} · ${s.status}`,
      href: `/teams/${s.teamId}`,
    })),
    일지: dailyReports.map(r => ({
      id: r.id, label: `${teamName.get(r.teamId) ?? "팀?"} ${r.sessionNo}차시 일지`,
      detail: `${r.reportDate}${r.subject ? ` · ${r.subject}` : ""}${r.notes ? ` · ${r.notes.slice(0,30)}` : ""}`,
      href: `/daily`,
    })),
  };

  // 비어있는 카테고리 제거
  const filtered = Object.fromEntries(Object.entries(results).filter(([, v]) => v.length > 0));
  const totalCount = Object.values(filtered).reduce((s: number, v: any) => s + v.length, 0);

  return NextResponse.json({ q: qRaw, total: totalCount, results: filtered });
}
