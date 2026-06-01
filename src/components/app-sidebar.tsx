"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, CalendarDays, Target, FileText, FileSpreadsheet, Phone, Settings, LogOut, Receipt, Building2, FolderOpen, CreditCard, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { canAccess, ROLE_LABEL, type ModuleKey, type Role } from "@/lib/permissions";

const ALL_NAV: { href: string; label: string; icon: React.ElementType; key: ModuleKey }[] = [
  { href: "/dashboard", label: "대시보드",  icon: LayoutDashboard, key: "dashboard" },
  { href: "/daily",     label: "일일현황",  icon: CalendarDays,    key: "daily" },
  { href: "/teams",     label: "팀별 운영현황", icon: Target,       key: "kpi" },
  { href: "/documents", label: "서류제출",  icon: FileText,        key: "documents" },
  { href: "/expenses",  label: "팀별정산",  icon: Receipt,         key: "expenses" },
  { href: "/agency",    label: "기관경비",  icon: Building2,       key: "agency" },
  { href: "/expenses/reconcile", label: "카드 대사", icon: CreditCard, key: "reconcile" },
  { href: "/reports",   label: "주간보고",  icon: FileSpreadsheet, key: "reports" },
  { href: "/forms",     label: "제출서류 양식", icon: FolderOpen,  key: "forms" },
  { href: "/contacts",  label: "연락망",    icon: Phone,           key: "contacts" },
  { href: "/settings",  label: "연동설정",  icon: Settings,        key: "settings" },
];

export function AppSidebar({ role, name }: { role: Role; name: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const items = ALL_NAV.filter((item) => canAccess(role, item.key));

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex w-60 flex-col border-r bg-muted/30">
      <div className="flex h-16 items-center gap-2 border-b px-4">
        <div className="h-9 w-9 rounded-lg bg-emerald-500 flex items-center justify-center text-white font-bold">성</div>
        <div>
          <div className="text-sm font-semibold leading-tight">성장농 교육운영</div>
          <div className="text-xs text-muted-foreground">2026 맞춤형과정</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-emerald-100 text-emerald-900"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-3">
        <div className="flex items-center justify-between gap-2 rounded-md bg-background p-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{name}</div>
            <div className="text-xs text-muted-foreground">{ROLE_LABEL[role]}</div>
          </div>
          <div className="flex items-center gap-0.5">
            <Link
              href="/me/password"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="비밀번호 변경"
            >
              <KeyRound className="h-4 w-4" />
            </Link>
            <button
              onClick={logout}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="로그아웃"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
