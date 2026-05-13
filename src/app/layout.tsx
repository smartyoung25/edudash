import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "성장농 교육운영 관리",
  description: "2026 성장농 맞춤형과정 교육운영 관리 시스템",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="min-h-screen bg-background antialiased">{children}</body>
    </html>
  );
}
