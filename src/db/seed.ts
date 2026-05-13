import bcrypt from "bcryptjs";
import { db } from "./local-client";
import {
  users,
  teams,
  members,
  sessions,
  attendance,
  dailyReports,
  kpiDefinitions,
  kpiProgress,
  documents,
  contacts,
  integrationStatus,
} from "./schema";
import { SEED_TEAMS } from "../lib/teams";

const FIRST_NAMES = [
  "민준", "서연", "도윤", "지우", "예준", "서윤", "주원", "지민", "지호", "수아",
  "유준", "하은", "건우", "지유", "현우", "윤서", "선우", "채원", "민재", "다은",
  "은우", "수빈", "준혁", "유진", "정우", "예린", "민호", "혜린", "지훈", "소연",
];
const LAST_NAMES = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "오", "서", "신"];

function pickName(seed: number) {
  const last = LAST_NAMES[seed % LAST_NAMES.length];
  const first = FIRST_NAMES[(seed * 7) % FIRST_NAMES.length];
  return last + first;
}

function pickGender(seed: number): "M" | "F" {
  return seed % 2 === 0 ? "M" : "F";
}

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function shiftDate(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const SUBJECTS = [
  "오리엔테이션 및 운영 안내",
  "토양 분석 기초",
  "병해충 진단 실습",
  "스마트센서 설치 실습",
  "관수·관비 시스템 운영",
  "환경 데이터 분석",
  "방제 계획 수립",
  "수확 후 관리",
  "유통·마케팅 기초",
  "현장 사례 워크숍",
  "경영 관리 기초",
  "성과 점검 및 발표",
  "졸업 평가",
];

async function clearAll() {
  // 의존성 역순 삭제
  await db.delete(attendance);
  await db.delete(kpiProgress);
  await db.delete(kpiDefinitions);
  await db.delete(dailyReports);
  await db.delete(sessions);
  await db.delete(documents);
  await db.delete(members);
  await db.delete(contacts);
  await db.delete(users);
  await db.delete(teams);
  await db.delete(integrationStatus);
}

async function main() {
  console.log("Resetting tables...");
  await clearAll();

  // ── 팀
  console.log("Inserting teams...");
  const insertedTeams: { id: number; name: string; headCount: number; totalSessions: number; endDate: string; professorName: string }[] = [];
  for (const t of SEED_TEAMS) {
    const [row] = await db.insert(teams).values({
      name: t.name,
      product: t.product,
      cohort: t.cohort,
      courseName: t.courseName,
      region: t.region,
      headCount: t.headCount,
      totalSessions: t.totalSessions,
      endDate: t.endDate,
      professorName: t.professorName,
    }).returning({ id: teams.id });
    insertedTeams.push({ id: row.id, name: t.name, headCount: t.headCount, totalSessions: t.totalSessions, endDate: t.endDate, professorName: t.professorName });
  }

  // ── 교육생
  console.log("Inserting members...");
  const teamMembers: Record<number, number[]> = {}; // teamId -> memberId[]
  let memberSeed = 0;
  for (const t of insertedTeams) {
    teamMembers[t.id] = [];
    for (let i = 0; i < t.headCount; i++) {
      const [row] = await db.insert(members).values({
        teamId: t.id,
        name: pickName(memberSeed++),
        gender: pickGender(memberSeed),
      }).returning({ id: members.id });
      teamMembers[t.id].push(row.id);
    }
  }

  // ── 차시 (현재 날짜 기준 일부 완료/진행중/예정)
  console.log("Inserting sessions...");
  const today = new Date();
  const teamSessions: Record<number, { id: number; sessionNo: number; date: string; status: string; subject: string }[]> = {};

  for (const t of insertedTeams) {
    teamSessions[t.id] = [];
    const end = new Date(t.endDate);
    // 시작일 = 종료일 - (totalSessions * 7일)
    const start = new Date(end);
    start.setDate(start.getDate() - t.totalSessions * 7);

    for (let i = 0; i < t.totalSessions; i++) {
      const dt = new Date(start);
      dt.setDate(dt.getDate() + i * 7);
      const dateStr = dt.toISOString().slice(0, 10);
      let status: "planned" | "in-progress" | "done" = "planned";
      const diffDays = (today.getTime() - dt.getTime()) / 86400000;
      if (diffDays > 3) status = "done";
      else if (diffDays > -3) status = "in-progress";

      const [row] = await db.insert(sessions).values({
        teamId: t.id,
        sessionNo: i + 1,
        subject: SUBJECTS[i % SUBJECTS.length],
        scheduledDate: dateStr,
        status,
      }).returning({ id: sessions.id });
      teamSessions[t.id].push({ id: row.id, sessionNo: i + 1, date: dateStr, status, subject: SUBJECTS[i % SUBJECTS.length] });
    }
  }

  // ── 출석 + 일일현황 (완료된 차시에 한해)
  console.log("Inserting attendance & daily reports...");
  for (const t of insertedTeams) {
    for (const s of teamSessions[t.id]) {
      if (s.status === "planned") continue;
      const memberIds = teamMembers[t.id];
      let absentCount = 0;
      const absentNames: string[] = [];
      for (const mid of memberIds) {
        // 92% 출석률
        const isPresent = Math.random() < 0.92;
        await db.insert(attendance).values({
          sessionId: s.id,
          memberId: mid,
          status: isPresent ? "present" : "absent",
          absentReason: isPresent ? null : "개인 일정",
        });
        if (!isPresent) {
          absentCount++;
          // member 이름 조회 대신 idx 기반
          absentNames.push(`교육생${mid}`);
        }
      }
      await db.insert(dailyReports).values({
        teamId: t.id,
        sessionNo: s.sessionNo,
        reportDate: s.date,
        subject: s.subject,
        attended: memberIds.length - absentCount,
        absent: absentCount,
        absentNames: absentNames.length ? absentNames.join(", ") : null,
        absentReason: absentNames.length ? "개인 일정" : null,
        notes: absentCount === 0 ? "전원출석" : null,
        source: "manual",
      });
    }
  }

  // ── KPI
  console.log("Inserting KPI...");
  const kpiTemplates = [
    { name: "현장 적용도",   target: 80, unit: "%", desc: "교육 내용을 현장 농장에 적용한 정도" },
    { name: "지식 습득률",   target: 85, unit: "%", desc: "사전 대비 사후 지식 평가 점수 향상률" },
    { name: "운영 효율 개선", target: 70, unit: "%", desc: "스마트팜 도입 후 작업 효율 향상도" },
  ];
  for (const t of insertedTeams) {
    const defIds: number[] = [];
    for (const k of kpiTemplates) {
      const [row] = await db.insert(kpiDefinitions).values({
        teamId: t.id,
        name: k.name,
        targetValue: k.target,
        unit: k.unit,
        description: k.desc,
      }).returning({ id: kpiDefinitions.id });
      defIds.push(row.id);
    }
    for (const mid of teamMembers[t.id]) {
      for (const did of defIds) {
        const baseline = 10 + Math.floor(Math.random() * 20);
        const mid1 = baseline + 15 + Math.floor(Math.random() * 15);
        const mid2 = mid1 + 10 + Math.floor(Math.random() * 15);
        const mid3 = mid2 + 5 + Math.floor(Math.random() * 15);
        const checkpoints = [
          { round: 1, value: mid1, date: "2026-04-15" },
          { round: 2, value: mid2, date: "2026-06-15" },
          { round: 3, value: mid3, date: "2026-08-15" },
        ];
        await db.insert(kpiProgress).values({
          memberId: mid,
          kpiDefId: did,
          baseline,
          midCheckpoints: JSON.stringify(checkpoints),
          finalValue: null,
        });
      }
    }
  }

  // ── 사용자
  console.log("Inserting users...");
  const passwordHash = await bcrypt.hash("1234", 10);
  await db.insert(users).values({ email: "admin",   passwordHash, name: "관리자(이암허브)", role: "admin" });
  await db.insert(users).values({ email: "coord1",  passwordHash, name: "코디네이터1",       role: "coordinator", teamId: insertedTeams[0].id });
  await db.insert(users).values({ email: "prof1",   passwordHash, name: "주임교수1",         role: "professor",   teamId: insertedTeams[0].id });
  await db.insert(users).values({ email: "funder",  passwordHash, name: "발주기관(농정원)", role: "funder" });

  // ── 연락망
  console.log("Inserting contacts...");
  for (const t of insertedTeams) {
    await db.insert(contacts).values({
      name: t.professorName,
      role: "주임교수",
      teamId: t.id,
      affiliation: `${t.name} 담당`,
      phone: `010-${String(1000 + t.id).padStart(4, "0")}-${String(2000 + t.id).padStart(4, "0")}`,
      email: `prof${t.id}@iiam.co.kr`,
      kind: "professor",
    });
  }
  await db.insert(contacts).values({
    name: "이암허브 PM", role: "PM", teamId: null, affiliation: "(주)이암허브",
    phone: "02-1234-5678", email: "pm@iiam.co.kr", kind: "internal",
  });
  await db.insert(contacts).values({
    name: "이암허브 운영팀", role: "운영", teamId: null, affiliation: "(주)이암허브",
    phone: "02-1234-5679", email: "ops@iiam.co.kr", kind: "internal",
  });

  // ── 서류 (일부 팀에 가짜 제출 기록)
  console.log("Inserting sample documents...");
  const docTypes = ["출석부", "코디일지", "경비영수증", "강사비지급확인서", "교육생일지"] as const;
  for (const t of insertedTeams.slice(0, 5)) {
    for (const month of [3, 4]) {
      for (const dt of docTypes) {
        await db.insert(documents).values({
          teamId: t.id,
          docType: dt,
          month,
          fileName: `${t.name}_${dt}_2026${String(month).padStart(2, "0")}.pdf`,
          filePath: `data/uploads/sample/${t.name}_${dt}_${month}.pdf`,
          source: "mail",
          status: "submitted",
          emailFrom: `coord${t.id}@iiam.co.kr`,
          emailSubject: `[${t.name}] ${month}월 ${dt}`,
        });
      }
    }
  }

  // ── 연동 상태 초기값
  await db.insert(integrationStatus).values({ type: "sheets", enabled: false, status: "disabled", message: "자격증명 미설정" });
  await db.insert(integrationStatus).values({ type: "drive",  enabled: false, status: "disabled", message: "자격증명 미설정" });
  await db.insert(integrationStatus).values({ type: "mail",   enabled: false, status: "disabled", message: "자격증명 미설정" });
  await db.insert(integrationStatus).values({ type: "ocr",    enabled: false, status: "disabled", message: "자격증명 미설정" });

  console.log("\n✓ Seed complete");
  console.log(`  ${insertedTeams.length} teams, ${Object.values(teamMembers).flat().length} members`);
  console.log("\n로그인 계정:");
  console.log("  admin  / 1234   (관리자)");
  console.log("  coord1 / 1234   (코디네이터)");
  console.log("  prof1  / 1234   (주임교수)");
  console.log("  funder / 1234   (발주기관)");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
