// 설문 공통 타입·상수·검증 (API 라우트 / 빌더 / 응답폼 / 결과 공용)
import { z } from "zod";

export type QType = "scale5" | "short" | "long" | "choice";

export const QTYPE_LABEL: Record<QType, string> = {
  scale5: "5점 척도",
  short: "단답형",
  long: "장문형",
  choice: "객관식(단일선택)",
};

export const SURVEY_STATUS_LABEL: Record<"draft" | "open" | "closed", string> = {
  draft: "작성중",
  open: "진행중",
  closed: "마감",
};

// 5점 척도 보기 (5 → 1 순서)
export const SCALE5_OPTIONS: { value: number; label: string }[] = [
  { value: 5, label: "매우 그렇다" },
  { value: 4, label: "그렇다" },
  { value: 3, label: "보통이다" },
  { value: 2, label: "그렇지 않다" },
  { value: 1, label: "전혀 그렇지 않다" },
];

// ── 입력 검증 (관리자 생성/편집) ──
export const QuestionInput = z.object({
  section: z.string().max(50).nullish(),
  qType: z.enum(["scale5", "short", "long", "choice"]),
  label: z.string().min(1, "문항 내용을 입력하세요").max(500),
  required: z.boolean().optional().default(false),
  options: z.array(z.string().min(1).max(200)).max(20).optional().default([]),
});

export const SurveyInput = z.object({
  title: z.string().min(1, "제목을 입력하세요").max(200),
  description: z.string().max(5000).optional().default(""),
  status: z.enum(["draft", "open", "closed"]).optional().default("draft"),
  collectTeam: z.boolean().optional().default(true),
  questions: z.array(QuestionInput).min(1, "문항을 1개 이상 추가하세요").max(100),
});

export type QuestionInputT = z.infer<typeof QuestionInput>;
export type SurveyInputT = z.infer<typeof SurveyInput>;
