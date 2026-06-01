import { requireAuth } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { ChangePasswordForm } from "./change-password-form";

export const dynamic = "force-dynamic";

export default async function PasswordPage() {
  const session = await requireAuth();
  return (
    <div>
      <PageHeader title="비밀번호 변경" description={`${session.name ?? session.email} 계정의 비밀번호를 변경합니다.`} />
      <div className="p-6 max-w-md">
        <ChangePasswordForm />
      </div>
    </div>
  );
}
