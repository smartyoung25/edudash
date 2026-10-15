// 운영계획서(2026.09) 기반 신규 4개 반 생성: 토마토10기 / 한우8기 해움2 / 한우9기 청주 / 시설채소2기
// teams + members + sessions + expense_budgets + kpi_definitions/kpi_progress + team_aliases
// 같은 이름 팀이 이미 있으면 건너뜀(재실행 안전).
// dry-run(기본): node scripts/create-teams-261015.mjs --prod
// 실제 적용:     node scripts/create-teams-261015.mjs --prod --apply
import { createClient } from "@libsql/client";
import dotenv from "dotenv";

const APPLY = process.argv.includes("--apply");
const PROD = process.argv.includes("--prod");
if (PROD) dotenv.config({ path: ".env.vercel.prod" });
const c = PROD
  ? createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: "file:./data/app.db" });

const PROF = {
  구자정: { phone: "010-6345-8169", email: "samporogaja@hotmail.com" },
  이재규: { phone: "010-4419-4434", email: "jkhihi@hanmail.net" },
};
const COORD = {
  차선애: "purelea@iiam.co.kr",
  김성태: "37210114ok@gmail.com",
};

// members: [이름, 성별, 생년월일, 구분]
const TEAMS = [
  {
    name: "토마토10기", product: "토마토",
    courseName: "2026년 토마토10기-하우스 시설설계 과정",
    region: "굿뜨래웰빙마을 1층 영상실(부여), 선진농가(천안·아산)",
    professor: "구자정", coordinator: "차선애",
    planTotal: 13_560_000,
    members: [
      ["강영식", "M", "1968-01-13"], ["김도훈", "M", "1990-11-12"], ["김동규", "M", "1989-02-06"],
      ["김윤영", "F", "1987-01-29"], ["김종민", "M", "1991-02-09"], ["김효선", "F", "2000-05-24"],
      ["라영수", "M", "1999-06-12"], ["박소희", "F", "1992-03-09"], ["배광진", "M", "1984-08-28"],
      ["석진", "F", "1992-01-29"], ["신대호", "M", "1986-01-09"], ["이대권", "M", "1990-02-23"],
      ["이승용", "M", "1984-08-01"], ["이종윤", "M", "1987-05-03"], ["이주인", "M", "1989-03-21"],
      ["이훈호", "M", "1991-01-12"], ["임대현", "M", "1984-01-12"], ["정서윤", "F", "1988-06-19"],
      ["조나영", "F", "1997-12-04"], ["조도현", "M", "1999-04-23"],
    ].map(([n, g, b]) => [n, g, b, b >= "1985-01-01" ? "청년농" : "농업인"]),
    sessions: [
      [1, "2026-10-01", "교육 과정설계 및 공동 학습목표 설정 / 토마토 시설 입지조건 파악"],
      [2, "2026-10-08", "농장시설 기반 조성 이해 (토마토 시설 예정지 관리)"],
      [3, "2026-10-15", "피복재·골조 등 시설 설치 관리 (경질·기타 피복재, 골격자재)"],
      [4, "2026-10-22", "제어시설 설치 관리 / 선진지 견학 (천안·아산)"],
    ],
    budgets: { 강사비: 4_500_000, 식대: 840_000, 다과: 420_000, 기타: 200_000, 퍼실리테이터비용: 800_000, 재료비: 6_000_000, 임차비: 800_000 },
    teamKpi: { name: "[기수] 토마토10기 온실구축 제안요청서 작성", target: 1, unit: "건", desc: "현장과제 ② 영농 매뉴얼 제작·활용 — 온실구축 제안요청서 작성 (1건 제작)" },
    memberKpi: () => ({ name: "온실구축 제안요청서 작성", target: 1, unit: "건", desc: "산출방법: 제안요청서 작성 / 목표치: 1건 제작" }),
    aliases: ["토마토10", "토마토 10기", "토마토10기"],
  },
  {
    name: "한우8기 해움2", product: "한우",
    courseName: "2026년 한우08기-고급육 생산을 위한 한우 개량·조사료 활용 및 성과 실행 과정",
    region: "카페오늘, 인제군농업기술센터, 각 교육생 농가",
    professor: "이재규", coordinator: "차선애",
    planTotal: 13_790_000,
    members: [
      ["심규순", "M", "1980-04-28", "농업인"], ["유영인", "M", "1995-07-21", "청년농"],
      ["전명숙", "F", "1980-08-18", "농업인"], ["이택훈", "M", "1991-09-27", "청년농"],
      ["김병주", "M", "1994-01-12", "청년농"], ["조우석", "M", "1999-03-04", "청년농"],
      ["정동현", "M", "1996-12-06", "청년농"],
    ],
    sessions: [
      [1, "2026-08-29", "농가 맞춤형 현장 컨설팅"],
      [2, "2026-09-18", "심사 및 우량우 선발관리 (한우 개량을 위한 선형심사 및 선발과 도태)"],
      [3, "2026-09-19", "농가 맞춤형 현장 컨설팅"],
      [4, "2026-10-13", "사료 관리 (TMR사료·사료 생산 및 품질관리) / 이티바이오·우성사료 견학"],
      [5, "2026-10-14", "한우 도태 관리·생산성 향상 비육 기술 (선진지 견학 및 현장방문 컨설팅)"],
      [6, "2026-10-23", "생산성 향상 비육 기술"],
      [7, "2026-10-24", "농가 맞춤형 현장 컨설팅"],
    ],
    budgets: { 강사비: 7_500_000, 출장비: 350_000, 숙박: 840_000, 식대: 1_120_000, 다과: 280_000, 퍼실리테이터비용: 1_400_000, 재료비: 2_100_000, 임차비: 200_000 },
    teamKpi: { name: "[기수] 한우해움2 1++ 출현율", target: 15, unit: "%p", desc: "출하등급 기준 교육 및 출하시점 표준화 — 산출: 1++ 출현율, 평균 도체중 / 목표: 1++출현율 +15%p" },
    memberKpi: {
      김병주: { name: "평균 생시체중", target: 32, unit: "kg", desc: "송아지 초기 영양관리 강화 및 생시체중 개선 및 비육우 사양관리 — 목표: 평균 생시체중 32kg 이상" },
      조우석: { name: "등심단면적", target: 108, unit: "㎠", desc: "육성기 근육발달 중심 사양관리 — 목표: 등심단면적 108㎠ 이상, A++ 50% 이상" },
      전명숙: { name: "평균 도체중", target: 530, unit: "kg", desc: "육성기 근육발달 중심 사양관리 — 목표: 도체중 530kg 이상" },
      이택훈: { name: "마블링스코어", target: 8.0, unit: "점", desc: "송아지 단계별 사양관리 체계화 — 목표: 마블링스코어 8.0 이상, A++ 50% 이상" },
      유영인: { name: "마블링스코어", target: 7.5, unit: "점", desc: "출하우 외모·비육도 관리 강화 — 목표: 마블링스코어 7.5 이상" },
      심규순: { name: "등심단면적", target: 100, unit: "㎠", desc: "영양관리 강화를 통한 육질 개선 — 목표: 등심단면적 100㎠ 이상" },
      정동현: { name: "A++ 출현율", target: 50, unit: "%", desc: "비육우 영양관리 및 사양관리 — 목표: A++ 50% 이상" },
    },
    aliases: ["한우8기", "한우08기", "한우 8기", "한우8", "해움2", "해움 2기", "한우해움2", "한우해움2기", "한우해움 2기"],
  },
  {
    name: "한우9기 청주", product: "한우",
    courseName: "2026년 한우09기-한우 품질 향상과 농가 소득 증대를 위한 사양·출하 관리 심화 과정",
    region: "오피스프리, 각 교육생 농가",
    professor: "이재규", coordinator: "차선애",
    planTotal: 14_460_000,
    members: [
      ["김효섭", "M", "1988-05-09"], ["이상합", "M", "1992-01-23"], ["최광석", "M", "1986-06-27"],
      ["김철환", "M", "1986-03-03"], ["변준수", "M", "1988-05-22"], ["이영근", "M", "1989-06-08"],
      ["정예진", "F", "1996-02-01"],
    ].map(([n, g, b]) => [n, g, b, "청년농"]),
    sessions: [
      [1, "2026-09-11", "사료품질 관리 (사료품질 평가방법)"],
      [2, "2026-09-12", "한우 번식계획 수립 관리 (현장 방문 컨설팅 1회차)"],
      [3, "2026-10-07", "한우 입식 및 육성관리 기초 (우시장 소 보는 방법)"],
      [4, "2026-10-08", "생산성 향상 비육 기술 (현장방문 컨설팅 2회차)"],
      [5, "2026-10-12", "생산성 향상 비육 기술 (일본 흑우 고급육 이해와 한우 고급육 적용)"],
      [6, "2026-10-13", "생산성 향상 비육 기술 (구간별 사양관리 총정리)"],
      [7, "2026-11-13", "한우 번식계획 수립 관리 (선진지 견학)"],
      [8, "2026-11-29", "역량강화 목표 점검 및 성과 총평"],
    ],
    budgets: { 강사비: 9_000_000, 식대: 640_000, 다과: 320_000, 퍼실리테이터비용: 1_600_000, 재료비: 2_100_000, 임차비: 800_000 },
    teamKpi: { name: "[기수] 우두머리2 송아지 폐사율", target: 5, unit: "%", desc: "사양관리 및 경영 개선, 출하시기 조절 — 산출: 출하 성적 향상 및 경영전략 로드맵 / 목표: 송아지 폐사율 5% 이내, 구간별 사양관리 기준 수립" },
    memberKpi: {
      김철환: { name: "등심단면적 향상", target: 8, unit: "%", desc: "송아지 이유 후 연변사양관리를 통한 등심 단면적 상승 — 목표: 송아지 폐사율 2%, 등심단면적 8% 향상" },
      이영근: { name: "송아지 폐사율", target: 3, unit: "%", desc: "높은 폐사율로 인한 경영 손해, 번식우 농장으로 전환 — 목표: 번식우 농장으로 전환, 송아지 폐사율 3% 미만" },
      최광석: { name: "등심단면적 향상", target: 5, unit: "%", desc: "사양관리를 통한 등심 단면적 및 고급육 만들기 — 목표: 출하월령 31개월, 등심단면적 5% 이상" },
      이상합: { name: "수정횟수", target: 1.7, unit: "회", desc: "번식우 사양관리를 통한 출하 성적 향상 — 목표: 수정횟수 1.7 이하, 번식우 사양관리 기준 확립" },
      김효섭: { name: "도체중 향상", target: 5, unit: "%", desc: "사양관리를 통한 출하 성적 향상 — 목표: 도체중 5% 향상" },
      변준수: { name: "번식우·송아지 사양관리 기준", target: 1, unit: "건", desc: "번식우 사양관리를 통한 출하 성적 향상 — 목표: 번식우, 송아지 사양관리 기준 확립" },
      정예진: { name: "도체중·등심단면적 향상", target: 5, unit: "%", desc: "사양관리를 통한 등심 단면적 및 출하 성적 향상 — 목표: 도체중 5% 향상, 등심단면적 5% 향상" },
    },
    aliases: ["한우9기", "한우09기", "한우 9기", "한우9", "우두머리2", "우두머리 2기", "한우청주9기", "한우청주 9기", "청주9기", "청주 9기"],
  },
  {
    name: "시설채소2기", product: "시설채소",
    courseName: "2026년 시설채소02기-하우스 시설설계 과정",
    region: "밀양혁신밸리(경남 스마트팜 혁신밸리), 선진농가(천안·아산)",
    professor: "구자정", coordinator: "김성태",
    planTotal: 15_560_000,
    members: [
      ["권용우", "M", "1992-09-16"], ["김재원", "M", "1986-04-25"], ["문영훈", "M", "1988-05-14"],
      ["문정원", "M", "1981-08-04"], ["박성준", "M", "1992-12-16"], ["박재환", "M", "1991-01-27"],
      ["심동현", "M", "1996-11-07"], ["이효중", "M", "1991-10-20"], ["임민석", "M", "1986-12-05"],
      ["정재헌", "M", "1994-08-24"], ["정진호", "M", "2001-02-13"], ["조래영", "M", "1985-07-05"],
      ["하명수", "M", "1993-09-17"],
    ].map(([n, g, b]) => [n, g, b, "청년농"]),
    sessions: [
      [1, "2026-09-29", "교육 과정설계 및 공동 학습목표 설정 / 시설채소 시설 입지조건 파악"],
      [2, "2026-10-05", "농장시설 기반 조성 이해 (시설 예정지 관리, 시설 원가 산출 및 시공 계약 관리)"],
      [3, "2026-10-12", "피복재·골조 등 시설 설치 관리 (경질·기타 피복재, 골격자재)"],
      [4, "2026-10-19", "스마트팜 선진농가 견학 (천안·아산)"],
      [5, "2026-10-26", "제어시설 설치 관리 / 시설채소 양액 이해 및 조제"],
      [6, "2026-11-02", "시설채소 데이터 수집 및 기록 / 제어기 및 제어반 유지관리"],
    ],
    budgets: { 강사비: 7_200_000, 출장비: 600_000, 식대: 840_000, 다과: 420_000, 기타: 200_000, 퍼실리테이터비용: 1_200_000, 재료비: 3_900_000, 임차비: 1_200_000 },
    teamKpi: { name: "[기수] 시설채소2기 온실구축 제안요청서 작성", target: 1, unit: "건", desc: "현장과제 ① 영농지식·기술 습득 — 온실구축 제안요청서 작성법 실습 (1건 제작)" },
    memberKpi: () => ({ name: "온실구축 제안요청서 작성", target: 1, unit: "건", desc: "산출방법: 제안요청서 작성 / 목표치: 1건 제작" }),
    aliases: ["시설채소2기", "시설채소02기", "시설채소2", "시설채소02", "시설채소 2기"],
  },
];

// 기존 토마토7기 탭명 오타("토마토1기")는 '토마토 단일팀 폴백'으로 매칭돼 왔다.
// 토마토 팀이 2개가 되면 폴백이 꺼지므로 정확 매칭 alias로 보강한다.
const EXTRA_ALIASES = [{ teamName: "토마토7기", alias: "토마토1기" }];

// ───── 사전 검증 ─────
let problems = 0;
const existingAliases = new Map((await c.execute("SELECT alias, team_id FROM team_aliases")).rows.map((r) => [String(r.alias), Number(r.team_id)]));
const existingTeams = new Map((await c.execute("SELECT id, name FROM teams")).rows.map((r) => [String(r.name), Number(r.id)]));
for (const t of TEAMS) {
  const sum = Object.values(t.budgets).reduce((a, b) => a + b, 0);
  const youth = t.members.filter((m) => m[3] === "청년농").length;
  console.log(`\n■ ${t.name} (${t.product}) — 교육생 ${t.members.length}명(청년농 ${youth}/농업인 ${t.members.length - youth}), 회차 ${t.sessions.length}, 예산 ${sum.toLocaleString()}원`);
  if (sum !== t.planTotal) { console.log(`  ✗ 예산 합계 불일치: 계획서 ${t.planTotal.toLocaleString()}`); problems++; }
  if (existingTeams.has(t.name)) console.log(`  → 이미 존재(id=${existingTeams.get(t.name)}) — 건너뜀`);
  for (const a of t.aliases) {
    if (existingAliases.has(a)) { console.log(`  ✗ alias 중복: ${a} → team ${existingAliases.get(a)}`); problems++; }
  }
  if (typeof t.memberKpi === "object") {
    for (const [n] of t.members) if (!t.memberKpi[n]) { console.log(`  ✗ 개인 KPI 없음: ${n}`); problems++; }
  }
  for (const [no, d, s] of t.sessions) console.log(`  ${no}차시 ${d} ${s}`);
}
if (problems) { console.log(`\n문제 ${problems}건 — 중단`); process.exit(1); }

if (!APPLY) { console.log(`\nDRY RUN (${PROD ? "운영" : "로컬"} DB) — 실제 반영하려면 --apply 추가`); process.exit(0); }

// ───── 적용 ─────
for (const t of TEAMS) {
  if (existingTeams.has(t.name)) continue;
  const lastDate = t.sessions.map((s) => s[1]).sort().at(-1);
  const tx = await c.transaction("write");
  try {
    const prof = PROF[t.professor];
    const r = await tx.execute({
      sql: `INSERT INTO teams (name, product, cohort, course_name, region, head_count, total_sessions, end_date,
              professor_name, professor_phone, professor_email, coordinator_name, coordinator_phone, coordinator_email)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL,?)`,
      args: [t.name, t.product, t.name, t.courseName, t.region, t.members.length, t.sessions.length, lastDate,
        t.professor, prof.phone, prof.email, t.coordinator, COORD[t.coordinator]],
    });
    const teamId = Number(r.lastInsertRowid);

    const memberIds = {};
    for (const [name, gender, birth, type] of t.members) {
      const m = await tx.execute({
        sql: "INSERT INTO members (team_id, name, gender, learner_type, birth_date, edu_status) VALUES (?,?,?,?,?,'교육중')",
        args: [teamId, name, gender, type, birth],
      });
      memberIds[name] = Number(m.lastInsertRowid);
    }
    for (const [no, date, subject] of t.sessions) {
      await tx.execute({ sql: "INSERT INTO sessions (team_id, session_no, subject, scheduled_date, status) VALUES (?,?,?,?,'planned')", args: [teamId, no, subject, date] });
    }
    for (const [cat, amt] of Object.entries(t.budgets)) {
      await tx.execute({ sql: "INSERT INTO expense_budgets (team_id, category, amount) VALUES (?,?,?)", args: [teamId, cat, amt] });
    }
    const addKpi = async (k) => Number((await tx.execute({
      sql: "INSERT INTO kpi_definitions (team_id, name, target_value, unit, description) VALUES (?,?,?,?,?)",
      args: [teamId, k.name, k.target, k.unit, k.desc],
    })).lastInsertRowid);
    const addProgress = (memberId, kpiId) => tx.execute({
      sql: "INSERT INTO kpi_progress (member_id, kpi_def_id, baseline, mid_checkpoints) VALUES (?,?,0,'[]')", args: [memberId, kpiId],
    });
    const teamKpiId = await addKpi(t.teamKpi);
    for (const id of Object.values(memberIds)) await addProgress(id, teamKpiId);
    if (typeof t.memberKpi === "function") {
      const kpiId = await addKpi(t.memberKpi());
      for (const id of Object.values(memberIds)) await addProgress(id, kpiId);
    } else {
      for (const [name, k] of Object.entries(t.memberKpi)) {
        const kpiId = await addKpi({ ...k, name: `${name} — ${k.name}` });
        await addProgress(memberIds[name], kpiId);
      }
    }
    for (const a of t.aliases) await tx.execute({ sql: "INSERT INTO team_aliases (team_id, alias) VALUES (?,?)", args: [teamId, a] });
    await tx.commit();
    console.log(`✓ ${t.name} 생성 (id=${teamId})`);
  } catch (e) {
    await tx.rollback();
    console.error(`✗ ${t.name} 실패 — 롤백:`, e.message);
    process.exit(1);
  }
}
for (const { teamName, alias } of EXTRA_ALIASES) {
  const id = existingTeams.get(teamName);
  if (id && !existingAliases.has(alias)) {
    await c.execute({ sql: "INSERT INTO team_aliases (team_id, alias) VALUES (?,?)", args: [id, alias] });
    console.log(`✓ alias 보강: ${teamName} ← ${alias}`);
  }
}

// ───── 사후 검증 ─────
console.log("\n=== 검증 ===");
for (const t of TEAMS) {
  const row = (await c.execute({ sql: "SELECT id FROM teams WHERE name=?", args: [t.name] })).rows[0];
  const id = row.id;
  const one = async (sql) => (await c.execute({ sql, args: [id] })).rows[0].n;
  console.log(`${t.name} id=${id}: 교육생 ${await one("SELECT COUNT(*) n FROM members WHERE team_id=?")}, 회차 ${await one("SELECT COUNT(*) n FROM sessions WHERE team_id=?")}, ` +
    `예산 ${Number(await one("SELECT SUM(amount) n FROM expense_budgets WHERE team_id=?")).toLocaleString()}원, KPI ${await one("SELECT COUNT(*) n FROM kpi_definitions WHERE team_id=?")}, ` +
    `KPI진행 ${await one("SELECT COUNT(*) n FROM kpi_progress kp JOIN members m ON m.id=kp.member_id WHERE m.team_id=?")}, alias ${await one("SELECT COUNT(*) n FROM team_aliases WHERE team_id=?")}`);
}
