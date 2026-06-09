import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { SurveyComposer } from "../survey-composer";

export const dynamic = "force-dynamic";

export default async function NewSurveyPage() {
  await requireRole(["admin"]);
  return (
    <div className="space-y-4">
      <PageHeader title="새 설문 만들기" description="제목·안내문과 문항을 구성한 뒤 저장하세요. 상태를 '진행중'으로 두면 공개 링크로 응답을 받을 수 있습니다." />
      <div className="px-6">
        <SurveyComposer />
      </div>
    </div>
  );
}
