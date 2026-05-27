import { PageHeader } from "@/components/page-header";

function Box({ className = "" }: { className?: string }) {
  return <div className={`rounded-lg bg-muted/40 animate-pulse ${className}`} />;
}

export default function DashboardLoading() {
  return (
    <div>
      <PageHeader title="대시보드" description="불러오는 중..." />
      <div className="p-6 space-y-5" aria-busy="true" aria-label="대시보드 로딩 중">
        <Box className="h-16" />
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <Box key={i} className="h-32" />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-12">
          <Box className="lg:col-span-8 h-[320px]" />
          <Box className="lg:col-span-4 h-[320px]" />
        </div>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Box key={i} className="h-40" />)}
        </div>
      </div>
    </div>
  );
}
