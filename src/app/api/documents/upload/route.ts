import { NextResponse } from "next/server";

// Vercel 함수 body 4.5MB 제한으로 인해 이 경로는 사용 중단.
// 클라이언트는 /api/documents/upload-url 로 세션을 받은 뒤 Drive 에 직접 PUT 하고,
// /api/documents/finalize 로 메타데이터를 등록해야 한다.
export async function POST() {
  return NextResponse.json(
    {
      error: "이 엔드포인트는 더 이상 사용되지 않습니다. /api/documents/upload-url 을 사용하세요.",
    },
    { status: 410 },
  );
}
