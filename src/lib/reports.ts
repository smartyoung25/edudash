import ExcelJS from "exceljs";
import { db, schema } from "@/db/client";
import { eq, and, gte, lte } from "drizzle-orm";
import { getTeamProgress, getMemberKpiSummary } from "./kpi";

export async function generateWeeklyReport(weekStart: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "성장농 교육운영 시스템";
  wb.created = new Date();

  const teams = await db.select().from(schema.teams);
  const weekStartDate = new Date(weekStart);
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setDate(weekEndDate.getDate() + 6);
  const weekEnd = weekEndDate.toISOString().slice(0, 10);

  // ── 시트 1: (기수별) 운영현황
  const s1 = wb.addWorksheet("(기수별) 운영현황");
  s1.columns = [
    { header: "팀명",    key: "name",       width: 18 },
    { header: "기수",    key: "cohort",     width: 8 },
    { header: "품목",    key: "product",    width: 8 },
    { header: "과정명",  key: "courseName", width: 18 },
    { header: "지역",    key: "region",     width: 14 },
    { header: "주임교수", key: "professor",  width: 12 },
    { header: "교육생",  key: "headCount",  width: 8 },
    { header: "총 차시", key: "total",      width: 8 },
    { header: "완료 차시", key: "done",     width: 10 },
    { header: "진도율(%)", key: "percent",  width: 10 },
    { header: "최종일",  key: "endDate",    width: 12 },
  ];
  s1.getRow(1).font = { bold: true };
  s1.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6F4EA" } };

  for (const t of teams) {
    const p = await getTeamProgress(t.id);
    s1.addRow({
      name: t.name,
      cohort: t.cohort,
      product: t.product,
      courseName: t.courseName,
      region: t.region,
      professor: t.professorName,
      headCount: t.headCount,
      total: p.total,
      done: p.done,
      percent: p.progressPercent,
      endDate: t.endDate,
    });
  }

  // ── 시트 2: (교육생별) 운영현황
  const s2 = wb.addWorksheet("(교육생별) 운영현황");
  s2.columns = [
    { header: "팀명",    key: "team",     width: 18 },
    { header: "기수",    key: "cohort",   width: 8 },
    { header: "교육생",  key: "name",     width: 12 },
    { header: "총 차시", key: "total",    width: 8 },
    { header: "출석",    key: "attended", width: 8 },
    { header: "결석",    key: "absent",   width: 8 },
    { header: "출석률(%)", key: "rate",   width: 10 },
    { header: "KPI 평균(%)", key: "kpi",  width: 12 },
  ];
  s2.getRow(1).font = { bold: true };
  s2.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6F4EA" } };

  for (const t of teams) {
    const members = await db.select().from(schema.members).where(eq(schema.members.teamId, t.id));
    const attRows = await db
      .select()
      .from(schema.attendance)
      .innerJoin(schema.sessions, eq(schema.attendance.sessionId, schema.sessions.id))
      .where(eq(schema.sessions.teamId, t.id));
    for (const m of members) {
      const memberAtt = attRows.filter((r) => r.attendance.memberId === m.id);
      const total = memberAtt.length;
      const present = memberAtt.filter((r) => r.attendance.status === "present").length;
      const absent = total - present;
      const rate = total === 0 ? 0 : Math.round((present / total) * 100);
      const kpi = await getMemberKpiSummary(m.id, m.name);
      s2.addRow({
        team: t.name,
        cohort: t.cohort,
        name: m.name,
        total,
        attended: present,
        absent,
        rate,
        kpi: kpi.averagePercent,
      });
    }
  }

  // ── 시트 3: 질의사항 (수동 입력)
  const s3 = wb.addWorksheet("질의사항");
  s3.columns = [
    { header: "구분",     key: "type",     width: 12 },
    { header: "내용",     key: "content",  width: 50 },
    { header: "제출일",   key: "date",     width: 14 },
    { header: "처리상태", key: "status",   width: 12 },
  ];
  s3.getRow(1).font = { bold: true };
  s3.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6F4EA" } };
  s3.addRow({ type: "(예시)", content: "여기에 질의사항을 직접 입력하세요", date: weekStart, status: "대기" });

  // ── 시트 4: 연락망
  const s4 = wb.addWorksheet("연락망");
  s4.columns = [
    { header: "성명",     key: "name",   width: 12 },
    { header: "역할",     key: "role",   width: 12 },
    { header: "소속",     key: "aff",    width: 22 },
    { header: "담당팀",   key: "team",   width: 16 },
    { header: "연락처",   key: "phone",  width: 16 },
    { header: "이메일",   key: "email",  width: 22 },
  ];
  s4.getRow(1).font = { bold: true };
  s4.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6F4EA" } };
  const contactRows = await db.select().from(schema.contacts);
  const teamMap = new Map(teams.map((t) => [t.id, t.name]));
  for (const c of contactRows) {
    s4.addRow({
      name: c.name,
      role: c.role,
      aff: c.affiliation ?? "",
      team: c.teamId ? teamMap.get(c.teamId) ?? "" : "",
      phone: c.phone ?? "",
      email: c.email ?? "",
    });
  }

  // 시트 1 위에 헤더 정보 추가 (행 삽입)
  s1.spliceRows(1, 0,
    ["2026 성장농 맞춤형과정 주간 운영현황 보고"],
    [`주차: ${weekStart} ~ ${weekEnd}`],
    [`작성: (주)이암허브 / 생성일시: ${new Date().toISOString().slice(0, 16).replace("T", " ")}`],
    [],
  );
  s1.mergeCells("A1:K1");
  s1.getRow(1).font = { bold: true, size: 14 };
  s1.getRow(1).alignment = { horizontal: "center" };
  s1.mergeCells("A2:K2");
  s1.getRow(2).alignment = { horizontal: "center" };
  s1.mergeCells("A3:K3");
  s1.getRow(3).font = { italic: true, size: 9, color: { argb: "FF666666" } };
  s1.getRow(3).alignment = { horizontal: "center" };

  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer);
}
