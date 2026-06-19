// 설문 문항 엑셀 ↔ 빌더 변환 — 표준 템플릿 생성 + 업로드 파싱(서버 전용).
// 빌더(survey-composer)·import API·template API 공용. ExcelJS는 서버에서만 사용.
import ExcelJS from "exceljs";
import { QuestionInput, type QuestionInputT, type QType } from "./survey";

export const TEMPLATE_HEADERS = ["섹션", "문항", "유형", "필수", "보기"] as const;

// "5점 척도(단일)" 같은 라벨도 매칭되도록 소문자화 + 공백/괄호류 제거 후 별칭 검사.
function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s()（）[\]]/g, "");
}

// 유형 라벨/별칭 → qType. 인식 불가 시 null.
export function parseQType(raw: unknown): QType | null {
  const n = normalize(String(raw ?? ""));
  if (!n) return null;
  if (n === "scale5" || n.includes("척도") || n.includes("5점")) return "scale5";
  if (n === "short" || n.includes("단답")) return "short";
  if (n === "long" || n.includes("장문") || n.includes("서술")) return "long";
  if (n === "choice" || n.includes("객관") || n.includes("선택")) return "choice";
  return null;
}

// 필수 여부 — 예/필수/y/o/true/1 → true, 그 외/빈칸 → false.
export function parseRequired(raw: unknown): boolean {
  const n = normalize(String(raw ?? ""));
  return ["예", "필수", "y", "yes", "o", "true", "1", "ㅇ"].includes(n);
}

// 보기 셀 → 배열. 쉼표/줄바꿈/파이프/세미콜론 구분, trim, 빈값 제거.
export function parseOptions(raw: unknown): string[] {
  return String(raw ?? "")
    .split(/[\n,|;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ExcelJS 셀 값(리치텍스트/수식 등) → 평문 문자열.
function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    const o = v as { richText?: { text: string }[]; text?: string; result?: unknown };
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join("");
    if (typeof o.text === "string") return o.text;
    if (o.result != null) return String(o.result);
  }
  return "";
}

export type ParsedQuestions = { questions: QuestionInputT[]; warnings: string[] };

// 업로드된 xlsx 버퍼 → 문항 배열 + 경고. 문항 0개면 throw.
export async function parseQuestionsFromWorkbook(buf: Buffer): Promise<ParsedQuestions> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.getWorksheet("문항") ?? wb.worksheets[0];
  if (!ws) throw new Error("시트를 찾을 수 없습니다");

  // 1행을 헤더로 보고 컬럼 위치를 이름으로 매핑(순서 무관).
  const headerRow = ws.getRow(1);
  const colOf: Record<string, number> = {};
  headerRow.eachCell((cell, col) => {
    const name = normalize(cellText(cell.value));
    if (name) colOf[name] = col;
  });
  const idx = {
    section: colOf[normalize("섹션")],
    label: colOf[normalize("문항")],
    qType: colOf[normalize("유형")],
    required: colOf[normalize("필수")],
    options: colOf[normalize("보기")],
  };
  if (!idx.label || !idx.qType) {
    throw new Error('헤더에 "문항"과 "유형" 열이 필요합니다. 양식을 내려받아 사용하세요.');
  }

  const questions: QuestionInputT[] = [];
  const warnings: string[] = [];
  const lastRow = ws.rowCount;
  for (let r = 2; r <= lastRow; r++) {
    const row = ws.getRow(r);
    const get = (col?: number) => (col ? cellText(row.getCell(col).value) : "");
    const label = get(idx.label).trim();
    const qTypeRaw = get(idx.qType).trim();
    // 완전 빈 행은 조용히 건너뜀.
    if (!label && !qTypeRaw && !get(idx.section).trim()) continue;
    if (!label) { warnings.push(`${r}행: 문항 내용이 비어 건너뜀`); continue; }

    const qType = parseQType(qTypeRaw);
    if (!qType) { warnings.push(`${r}행: 유형 "${qTypeRaw}" 인식 불가(5점척도/단답형/장문형/객관식)`); continue; }

    const candidate = {
      section: get(idx.section).trim() || null,
      qType,
      label,
      required: parseRequired(get(idx.required)),
      options: qType === "choice" ? parseOptions(get(idx.options)) : [],
    };
    const parsed = QuestionInput.safeParse(candidate);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "형식 오류";
      warnings.push(`${r}행: ${msg}`);
      continue;
    }
    questions.push(parsed.data);
  }

  if (questions.length === 0) {
    throw new Error("가져올 문항이 없습니다. 양식의 2행부터 문항을 입력했는지 확인하세요.");
  }
  return { questions, warnings };
}

// 빈 표준 템플릿 워크북(헤더 + 예시 + 작성안내).
export function buildTemplateWorkbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("문항");
  ws.addRow([...TEMPLATE_HEADERS]);
  ws.getRow(1).font = { bold: true };
  ws.addRow(["강사", "강사의 설명이 이해하기 쉬웠다", "5점척도", "예", ""]);
  ws.addRow(["운영", "교육 운영 전반에 만족한다", "5점척도", "예", ""]);
  ws.addRow(["", "가장 좋았던 점을 적어주세요", "장문형", "아니오", ""]);
  ws.addRow(["", "재참여 의향", "객관식", "예", "추천한다, 보통, 추천 안 함"]);
  ws.columns.forEach((c, i) => { c.width = i === 1 ? 40 : i === 4 ? 32 : 14; });

  const guide = wb.addWorksheet("작성안내");
  const lines: [string, string][] = [
    ["항목", "설명"],
    ["섹션", "선택 입력. 문항을 묶는 머리말(예: 강사, 운영). 비워도 됩니다."],
    ["문항", "필수. 질문 내용. 비어 있으면 그 행은 건너뜁니다."],
    ["유형", "5점척도 / 단답형 / 장문형 / 객관식 중 하나 (영문 scale5/short/long/choice 도 가능)"],
    ["필수", "예 / Y / O / 1 = 필수 응답, 비우거나 아니오 = 선택"],
    ["보기", "객관식 전용. 쉼표( , )·줄바꿈·세로줄( | )로 구분. 2개 이상 권장."],
    ["", ""],
    ["사용법", "1행 머리글은 그대로 두고 2행부터 문항을 채운 뒤 설문 만들기 화면에서 업로드하세요."],
  ];
  for (const l of lines) guide.addRow(l);
  guide.getRow(1).font = { bold: true };
  guide.columns.forEach((c, i) => { c.width = i === 0 ? 14 : 80; });
  return wb;
}

export const TEMPLATE_FILENAME = "설문_문항양식.xlsx";
