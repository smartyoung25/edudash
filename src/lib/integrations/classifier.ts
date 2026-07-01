import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { EXTRA_EMAIL_TO_MATCH } from "./coordinator-overrides";

// 더 길고 구체적인 키워드부터 매칭 — "교육생일지"가 "일지"로 잘못 잡히지 않도록
const DOC_KEYWORDS: Record<string, string[]> = {
  출석부: ["출석부", "출석", "attendance"],
  교육생일지: ["교육생일지", "교육생 일지", "학습일지", "학습 일지"],
  코디일지: ["코디일지", "코디 일지", "코디네이터일지", "운영일지", "운영 일지"],
  강사비지급확인서: ["강사비지급확인서", "강사비 지급확인", "강사비", "강사 수당", "지급확인서"],
  경비영수증: ["경비영수증", "경비 영수증", "영수증", "경비 정산", "경비"],
};

// ──────────────── 팀 매칭 ────────────────

// 메모리 캐시 — 같은 sync 실행 내에서 DB 재조회 회피
let aliasCache: { teamId: number; alias: string }[] | null = null;
async function loadAliases() {
  if (aliasCache) return aliasCache;
  const rows = await db.select().from(schema.teamAliases);
  // 길이 내림차순 — 긴 별칭("딸기 17기")이 먼저 매칭되어야 짧은 것("딸기")으로 잘못 잡히지 않음
  aliasCache = rows.sort((a, b) => b.alias.length - a.alias.length);
  return aliasCache;
}
export function resetClassifierCache() {
  aliasCache = null;
}

// 본문/제목/파일명에서 가장 먼저 매칭되는 팀 찾기
export async function classifyTeamByText(...haystacks: string[]): Promise<number | null> {
  const aliases = await loadAliases();
  const text = haystacks.filter(Boolean).join(" \n ").toLowerCase();
  if (!text.trim()) return null;
  for (const a of aliases) {
    if (text.includes(a.alias.toLowerCase())) return a.teamId;
  }
  return null;
}

// 보내는 사람 이메일이 코디 user 라면 그 사람의 teamId
export async function classifyByEmail(fromAddress: string): Promise<number | null> {
  // 1순위: 코드 보강 매핑(이메일 → 작목/이름) — 운영 DB에 coordinatorEmail이 없어도 분류되게.
  // 매칭 결과가 팀 1개로 유일할 때만 사용(애매하면 아래 기존 로직으로 진행).
  const match = EXTRA_EMAIL_TO_MATCH[fromAddress.toLowerCase()];
  if (match) {
    const rows = await db.select({ id: schema.teams.id, name: schema.teams.name, product: schema.teams.product }).from(schema.teams);
    const cand = rows.filter(
      (t) =>
        (!match.product || t.product === match.product) &&
        (!match.nameIncludes || t.name.includes(match.nameIncludes)),
    );
    if (cand.length === 1) return cand[0].id;
  }
  const users = await db.select().from(schema.users);
  const coord = users.find((u) => u.email === fromAddress || u.email === fromAddress.split("@")[0]);
  if (coord && coord.teamId) return coord.teamId;

  // 2순위: 팀의 코디/주임교수 이메일과 일치하면 그 팀.
  // 단, 한 이메일이 여러 팀을 담당(겸임)하면 발신자만으론 못 정하므로 텍스트 별칭으로 넘긴다.
  const addr = fromAddress.toLowerCase();
  const teamRows = await db
    .select({ id: schema.teams.id, c: schema.teams.coordinatorEmail, p: schema.teams.professorEmail })
    .from(schema.teams);
  const matchedTeams = teamRows.filter(
    (t) => (t.c && t.c.toLowerCase() === addr) || (t.p && t.p.toLowerCase() === addr),
  );
  if (matchedTeams.length === 1) return matchedTeams[0].id;

  return null;
}

// 겸임 코디(한 이메일이 여러 팀 담당) 날짜기반 팀 판별.
// 발신자·별칭으로 팀을 못 가른 경우(예: 배1·배2 겸임 조효창), 제목/본문/파일명의 교육 날짜를
// 각 후보 팀의 회차 일정과 대조해 "가장 가까운(그리고 유일하게 가까운)" 팀으로 배정한다.
// 두 팀 회차가 같은 날이면(동률) 판별 불가 → null(미분류 유지).
async function classifyByCoordinatorDate(
  fromAddress: string,
  ...texts: (string | undefined)[]
): Promise<number | null> {
  const addr = fromAddress.toLowerCase();
  const teamRows = await db
    .select({ id: schema.teams.id, c: schema.teams.coordinatorEmail })
    .from(schema.teams);
  const candidates = teamRows.filter((t) => t.c && t.c.toLowerCase() === addr).map((t) => t.id);
  if (candidates.length < 2) return null; // 겸임 아니면 여기서 처리할 것 없음

  const dates = parseDatesFromText(texts.filter(Boolean).join(" "));
  if (dates.length === 0) return null;
  const dateTs = dates.map((d) => new Date(d).getTime()).filter((t) => !isNaN(t));
  if (dateTs.length === 0) return null;

  // 후보팀별 최소 거리(일) 계산
  const scored: { teamId: number; diffDays: number }[] = [];
  for (const teamId of candidates) {
    const sessions = await db
      .select({ d: schema.sessions.scheduledDate })
      .from(schema.sessions)
      .where(eq(schema.sessions.teamId, teamId));
    let best = Infinity;
    for (const s of sessions) {
      const sd = new Date(s.d).getTime();
      if (isNaN(sd)) continue;
      for (const dt of dateTs) best = Math.min(best, Math.abs(dt - sd) / 86_400_000);
    }
    scored.push({ teamId, diffDays: best });
  }
  scored.sort((a, b) => a.diffDays - b.diffDays);
  const [first, second] = scored;
  // 7일 이내이고, 2위보다 확실히(엄격히) 가까울 때만 채택
  if (first && first.diffDays <= 7 && (!second || first.diffDays < second.diffDays)) {
    return first.teamId;
  }
  return null;
}

// 종합 — 보낸이 → 제목/본문/파일명 별칭 → (겸임 코디면) 교육 날짜 순서로 시도
export async function classifyTeam(opts: {
  fromAddress: string;
  subject: string;
  body?: string;
  fileName?: string;
}): Promise<number | null> {
  const byEmail = await classifyByEmail(opts.fromAddress);
  if (byEmail) return byEmail;
  const byText = await classifyTeamByText(opts.subject, opts.body ?? "", opts.fileName ?? "");
  if (byText) return byText;
  return classifyByCoordinatorDate(opts.fromAddress, opts.subject, opts.body, opts.fileName);
}

// ──────────────── 서류 유형 ────────────────

// 모든 키워드를 길이 내림차순으로 평탄화해서 가장 구체적인 매칭이 항상 우선
const FLAT_DOC_KEYWORDS: { type: string; kw: string }[] = Object.entries(DOC_KEYWORDS)
  .flatMap(([type, kws]) => kws.map((kw) => ({ type, kw: kw.toLowerCase() })))
  .sort((a, b) => b.kw.length - a.kw.length);

export function classifyDocType(subject: string, fileName: string): string {
  const haystack = `${subject} ${fileName}`.toLowerCase();
  for (const { type, kw } of FLAT_DOC_KEYWORDS) {
    if (haystack.includes(kw)) return type;
  }
  return "미분류";
}

// ──────────────── 월 ────────────────

export function detectMonth(subject: string, receivedAt: string, body?: string, fileName?: string): number | null {
  const hay = `${subject} ${body ?? ""} ${fileName ?? ""}`;
  const m = hay.match(/(\d{1,2})\s*월/);
  if (m) {
    const month = Number(m[1]);
    if (month >= 1 && month <= 12) return month;
  }
  const d = new Date(receivedAt);
  if (isNaN(d.getTime())) return null;
  return d.getMonth() + 1;
}

// ──────────────── 차시 ────────────────

// 1단계: 텍스트에서 명시적 차시 패턴 추출 — "3차시", "3회차", "3회", "3차"
function parseSessionFromText(text: string): number | null {
  if (!text) return null;
  const m = text.match(/(\d{1,2})\s*[차회]\s*시?/);
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 99) return n;
  }
  return null;
}

// 2단계: 텍스트에서 교육 날짜 추출 → 모든 후보 ISO("YYYY-MM-DD") 배열로 반환
// 인식 패턴: 2026-03-17, 2026.03.17, 2026/03/17, 20260317, 26.03.17, 3월 17일, 3/17, 03-17
export function parseDatesFromText(text: string, defaultYear = new Date().getFullYear()): string[] {
  if (!text) return [];
  const out = new Set<string>();
  const yy = String(defaultYear);

  // YYYY[.-/년]MM[.-/월]DD[일?]
  for (const m of text.matchAll(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?/g)) {
    out.add(toIso(+m[1], +m[2], +m[3]));
  }
  // YYYYMMDD (8자리 연속)
  for (const m of text.matchAll(/(20\d{2})(\d{2})(\d{2})(?!\d)/g)) {
    out.add(toIso(+m[1], +m[2], +m[3]));
  }
  // YY.MM.DD (26.03.17 등 — 2000년대만)
  for (const m of text.matchAll(/(?<!\d)(\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})(?!\d)/g)) {
    const yy2 = 2000 + +m[1];
    if (yy2 >= 2024 && yy2 <= 2030) out.add(toIso(yy2, +m[2], +m[3]));
  }
  // M월 D일 (연도 없음 → defaultYear)
  for (const m of text.matchAll(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/g)) {
    out.add(toIso(+yy, +m[1], +m[2]));
  }
  // M/D, M-D, M.D (연도 없음 → defaultYear) — 시간/비율 등 오탐 방지 위해 앞뒤 비숫자 경계 + 1~12/1~31 제한
  for (const m of text.matchAll(/(?<!\d)(\d{1,2})[/.\-](\d{1,2})(?!\d)/g)) {
    const mm = +m[1], dd = +m[2];
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) out.add(toIso(+yy, mm, dd));
  }
  return [...out].filter(Boolean);
}

function toIso(y: number, m: number, d: number): string {
  if (m < 1 || m > 12 || d < 1 || d > 31) return "";
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// 후보 날짜들을 그 팀의 sessions와 매칭 — 정확 매칭 우선, 없으면 ±7일 가장 가까운 차시
async function inferSessionByDates(teamId: number, candidateDates: string[], fallbackDate: string | null): Promise<number | null> {
  const sessions = await db.select().from(schema.sessions).where(eq(schema.sessions.teamId, teamId));
  if (sessions.length === 0) return null;

  // 정확 매칭 (텍스트에서 뽑은 날짜 ↔ scheduled_date)
  for (const cand of candidateDates) {
    const exact = sessions.find((s) => s.scheduledDate === cand);
    if (exact) return exact.sessionNo;
  }

  // 가까운 매칭 — 텍스트 날짜 우선, 없으면 수신일자
  const tryDates = candidateDates.length > 0 ? candidateDates : (fallbackDate ? [fallbackDate] : []);
  let best: { sessionNo: number; diffDays: number } | null = null;
  for (const cand of tryDates) {
    const candTs = new Date(cand).getTime();
    if (isNaN(candTs)) continue;
    for (const s of sessions) {
      const d = new Date(s.scheduledDate).getTime();
      if (isNaN(d)) continue;
      const diff = Math.abs(candTs - d) / 86_400_000;
      if (!best || diff < best.diffDays) best = { sessionNo: s.sessionNo, diffDays: diff };
    }
  }
  if (!best) return null;
  return best.diffDays <= 7 ? best.sessionNo : null;
}

export async function detectSessionNo(opts: {
  teamId: number | null;
  subject: string;
  body?: string;
  fileName?: string;
  receivedAt: string;
}): Promise<number | null> {
  // 1순위: 텍스트 어디든 명시적 차시 패턴
  const sources = [opts.fileName ?? "", opts.subject, opts.body ?? ""];
  for (const src of sources) {
    const n = parseSessionFromText(src);
    if (n) return n;
  }
  if (!opts.teamId) return null;

  // 2순위: 텍스트에서 추출한 교육 날짜 → sessions.scheduled_date 매칭
  // 메일 수신일자에서 기본 연도 추출 (텍스트에 연도 없는 "3/17"·"3월 17일" 매칭용)
  const recvYear = !isNaN(new Date(opts.receivedAt).getTime())
    ? new Date(opts.receivedAt).getFullYear()
    : new Date().getFullYear();
  const allText = `${opts.fileName ?? ""} ${opts.subject} ${opts.body ?? ""}`;
  const dates = parseDatesFromText(allText, recvYear);

  // 3순위 폴백: 수신일자
  return inferSessionByDates(opts.teamId, dates, opts.receivedAt);
}
