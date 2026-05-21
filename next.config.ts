import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@libsql/client", "imapflow", "mailparser", "node-cron"],
  experimental: {
    serverActions: { bodySizeLimit: "25mb" },
    // 클라이언트 라우터 캐시 무력화 — 팀 페이지 등 동적 데이터가 즉시 반영되도록
    staleTimes: { dynamic: 0, static: 0 },
  },
};

export default nextConfig;
