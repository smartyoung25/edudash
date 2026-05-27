import { FormComposer } from "./form-composer";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default function NewFormPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="새 양식 글 작성" description="제목·카테고리·본문을 입력하고 첨부파일을 업로드하세요." />
      <FormComposer />
    </div>
  );
}
