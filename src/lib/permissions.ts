// 기획서 5장 권한 매트릭스

export type Role = "admin" | "coordinator" | "professor";

export type ModuleKey = "dashboard" | "daily" | "kpi" | "documents" | "expenses" | "agency" | "reconcile" | "reports" | "forms" | "contacts" | "settings" | "users";

export const ROLE_LABEL: Record<Role, string> = {
  admin: "관리자",
  coordinator: "코디네이터",
  professor: "주임교수",
};

// 모듈별 사이드바 표시 여부
export const MENU_ACCESS: Record<Role, ModuleKey[]> = {
  admin:       ["dashboard", "daily", "kpi", "documents", "expenses", "agency", "reconcile", "reports", "forms", "contacts", "settings", "users"],
  coordinator: ["dashboard", "daily", "kpi", "documents", "expenses", "forms"],
  professor:   ["dashboard", "daily", "kpi", "documents", "expenses", "forms"],
};

export function canAccess(role: Role, module: ModuleKey): boolean {
  return MENU_ACCESS[role].includes(module);
}

// 팀 상세에서 자기 담당팀만 접근 가능한 역할
export function isTeamScoped(role: Role): boolean {
  return role === "coordinator" || role === "professor";
}

// 서류 업로드 가능 여부
export function canUploadDocument(role: Role): boolean {
  return role === "admin" || role === "coordinator";
}

export function canResolveUnclassified(role: Role): boolean {
  return role === "admin";
}

export function canDownloadReport(role: Role): boolean {
  return role === "admin" || role === "coordinator";
}

export function canGenerateReport(role: Role): boolean {
  return role === "admin";
}
