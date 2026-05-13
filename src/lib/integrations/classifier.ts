import { db, schema } from "@/db/client";

const KEYWORDS: Record<string, string[]> = {
  출석부: ["출석", "출석부", "attendance"],
  코디일지: ["코디일지", "코디", "일지"],
  경비영수증: ["경비", "영수증", "비용", "expense"],
  강사비지급확인서: ["강사비", "강사", "지급확인"],
  교육생일지: ["교육생", "학습일지", "교육생일지"],
};

export async function classifyByEmail(fromAddress: string): Promise<number | null> {
  // 사전 등록된 코디 사용자(role=coordinator) 이메일 매칭
  const users = await db.select().from(schema.users);
  const coord = users.find((u) => u.email === fromAddress || u.email === fromAddress.split("@")[0]);
  if (coord && coord.teamId) return coord.teamId;
  return null;
}

export function classifyDocType(subject: string, fileName: string): string {
  const haystack = `${subject} ${fileName}`.toLowerCase();
  for (const [type, keywords] of Object.entries(KEYWORDS)) {
    for (const kw of keywords) {
      if (haystack.includes(kw.toLowerCase())) return type;
    }
  }
  return "미분류";
}

export function detectMonth(subject: string, receivedAt: string): number | null {
  // 제목에서 "N월" 패턴 우선
  const m = subject.match(/(\d{1,2})월/);
  if (m) {
    const month = Number(m[1]);
    if (month >= 1 && month <= 12) return month;
  }
  // 폴백: 수신일자
  const d = new Date(receivedAt);
  if (isNaN(d.getTime())) return null;
  return d.getMonth() + 1;
}
