export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // ── [C-1] 운영 환경 부팅 검증 ──
  const isProd = process.env.NODE_ENV === "production";
  const isVercel = !!process.env.VERCEL;
  const enforce = isProd || isVercel;

  if (enforce) {
    const sp = process.env.SESSION_PASSWORD;
    if (!sp) {
      throw new Error("[보안] SESSION_PASSWORD 환경변수가 누락되었습니다");
    }
    if (sp.length < 32) {
      throw new Error(
        `[보안] SESSION_PASSWORD 엔트로피 부족 (현재 ${sp.length}자, 최소 32자)`,
      );
    }
    if (!process.env.CRON_SECRET) {
      console.warn(
        "[보안] CRON_SECRET 미설정 — /api/integrations/mail/sync 가 외부에 노출될 수 있습니다",
      );
    }
  }

  // Vercel 환경에서는 in-process node-cron 스케줄러 대신 Vercel Cron 사용
  if (!isVercel) {
    const { startScheduler } = await import("./lib/integrations/scheduler");
    startScheduler();
  }
}
