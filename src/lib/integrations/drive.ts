import { Readable } from "stream";
import { getDriveClient } from "./google-auth";
import { env, isDriveEnabled } from "../env";

async function findOrCreateFolder(name: string, parentId: string): Promise<string> {
  const drive = getDriveClient();
  if (!drive) throw new Error("Drive client not initialized");

  const safeName = name.replace(/'/g, "\\'");
  const q = `name = '${safeName}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
  const list = await drive.files.list({ q, fields: "files(id,name)" });
  if (list.data.files && list.data.files.length > 0) {
    return list.data.files[0].id!;
  }
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
  });
  return created.data.id!;
}

function mimeFromExt(fileName: string): string {
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
  switch (ext) {
    case ".pdf": return "application/pdf";
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".xlsx": return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case ".docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".hwp": return "application/x-hwp";
    default: return "application/octet-stream";
  }
}

export interface UploadResult {
  ok: boolean;
  message: string;
  webViewLink?: string;
  fileId?: string;
}

/**
 * Upload a file to Drive under [team]/[docType]/[month]월/ (or 미분류 root if no team).
 * Accepts the file bytes directly — no local disk required.
 */
export async function uploadDocumentToDrive(opts: {
  teamName: string | null;
  docType: string;
  month: number | null;
  fileName: string;
  bytes: ArrayBuffer | Uint8Array | Buffer;
}): Promise<UploadResult> {
  if (!isDriveEnabled()) {
    return { ok: false, message: "Drive 자격증명 미설정" };
  }
  const drive = getDriveClient();
  if (!drive) return { ok: false, message: "Drive client not initialized" };

  try {
    let parent = env.DRIVE_ROOT_FOLDER_ID;
    if (opts.teamName) {
      parent = await findOrCreateFolder(opts.teamName, parent);
      parent = await findOrCreateFolder(opts.docType, parent);
      if (opts.month) {
        parent = await findOrCreateFolder(`${opts.month}월`, parent);
      }
    } else {
      parent = await findOrCreateFolder("미분류", parent);
    }

    const buffer = opts.bytes instanceof Uint8Array
      ? Buffer.from(opts.bytes)
      : Buffer.isBuffer(opts.bytes)
        ? opts.bytes
        : Buffer.from(new Uint8Array(opts.bytes));

    const created = await drive.files.create({
      requestBody: { name: opts.fileName, parents: [parent] },
      media: { mimeType: mimeFromExt(opts.fileName), body: Readable.from(buffer) },
      fields: "id,webViewLink",
    });
    return {
      ok: true,
      message: "업로드 완료",
      webViewLink: created.data.webViewLink ?? undefined,
      fileId: created.data.id ?? undefined,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "알 수 없는 오류" };
  }
}

/**
 * 브라우저가 Drive에 직접 PUT 할 수 있도록 resumable upload session URI 를 생성.
 * 서비스 계정 자격으로 세션을 열고, 반환된 location URL을 클라이언트에 전달한다.
 * 클라이언트는 해당 URL에 파일 바이트를 PUT 으로 전송.
 *
 * Vercel 함수 body 4.5MB 제한을 우회하기 위한 핵심 흐름.
 */
export async function createResumableUploadSession(opts: {
  teamName: string | null;
  docType: string;
  month: number | null;
  fileName: string;
  fileSize: number;
  mimeType?: string;
}): Promise<{ ok: true; uploadUrl: string; parentFolderId: string } | { ok: false; message: string }> {
  if (!isDriveEnabled()) {
    return { ok: false, message: "Drive 자격증명 미설정" };
  }

  try {
    let parent = env.DRIVE_ROOT_FOLDER_ID;
    if (opts.teamName) {
      parent = await findOrCreateFolder(opts.teamName, parent);
      parent = await findOrCreateFolder(opts.docType, parent);
      if (opts.month) {
        parent = await findOrCreateFolder(`${opts.month}월`, parent);
      }
    } else {
      parent = await findOrCreateFolder("미분류", parent);
    }

    const { getAccessToken } = await import("./google-auth");
    const token = await getAccessToken();
    if (!token) return { ok: false, message: "액세스 토큰 발급 실패" };

    const mimeType = opts.mimeType ?? mimeFromExt(opts.fileName);

    const initRes = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": mimeType,
          "X-Upload-Content-Length": String(opts.fileSize),
        },
        body: JSON.stringify({ name: opts.fileName, parents: [parent] }),
      },
    );

    if (!initRes.ok) {
      const text = await initRes.text();
      return { ok: false, message: `Drive 세션 생성 실패: ${initRes.status} ${text}` };
    }
    const location = initRes.headers.get("location");
    if (!location) return { ok: false, message: "Drive 세션 location 헤더 없음" };

    return { ok: true, uploadUrl: location, parentFolderId: parent };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "알 수 없는 오류" };
  }
}

/**
 * 업로드 완료 후 파일 메타데이터(webViewLink) 조회.
 */
export async function getDriveFileMeta(fileId: string): Promise<{ webViewLink?: string; name?: string } | null> {
  const drive = getDriveClient();
  if (!drive) return null;
  try {
    const res = await drive.files.get({ fileId, fields: "id,name,webViewLink" });
    return { webViewLink: res.data.webViewLink ?? undefined, name: res.data.name ?? undefined };
  } catch {
    return null;
  }
}

/**
 * Drive 파일 ID로 바이너리 다운로드.
 * 서비스 계정에 접근 권한 있어야 함.
 */
export async function downloadDriveFile(fileId: string): Promise<{ ok: true; name: string; buf: Buffer; mimeType: string } | { ok: false; message: string }> {
  const drive = getDriveClient();
  if (!drive) return { ok: false, message: "Drive client not initialized" };
  try {
    const meta = await drive.files.get({ fileId, fields: "id,name,mimeType,size" });
    const name = meta.data.name ?? `file_${fileId}`;
    const mimeType = meta.data.mimeType ?? "application/octet-stream";

    const res = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" }
    );
    const buf = Buffer.from(res.data as ArrayBuffer);
    return { ok: true, name, buf, mimeType };
  } catch (err: any) {
    return { ok: false, message: err?.message || "다운로드 실패" };
  }
}

/**
 * filePath(webViewLink 또는 fileId 문자열)에서 Drive 파일 ID 추출.
 */
export function extractDriveFileId(s: string): string | null {
  if (!s) return null;
  const m1 = s.match(/\/d\/([\w-]{20,})/);          // .../file/d/<id>/view
  if (m1) return m1[1];
  const m2 = s.match(/[?&]id=([\w-]{20,})/);          // ...?id=<id>
  if (m2) return m2[1];
  if (/^[\w-]{20,}$/.test(s.trim())) return s.trim(); // 순수 fileId
  return null;
}

/**
 * Drive 파일을 휴지통으로 이동 (완전 삭제 대신 안전). webViewLink/fileId 모두 허용.
 */
export async function deleteDriveFile(fileIdOrLink: string): Promise<{ ok: boolean; message: string }> {
  const drive = getDriveClient();
  if (!drive) return { ok: false, message: "Drive client not initialized" };
  const fileId = extractDriveFileId(fileIdOrLink);
  if (!fileId) return { ok: false, message: "fileId 추출 실패" };
  try {
    await drive.files.update({ fileId, requestBody: { trashed: true } });
    return { ok: true, message: "Drive 휴지통 이동" };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Drive 삭제 실패" };
  }
}

/**
 * Backwards-compatible wrapper for receipt uploads.
 */
export async function uploadReceipt(opts: {
  teamName: string;
  month: number;
  bytes: ArrayBuffer | Uint8Array | Buffer;
  fileName: string;
}): Promise<UploadResult> {
  return uploadDocumentToDrive({
    teamName: opts.teamName,
    docType: "경비영수증",
    month: opts.month,
    fileName: opts.fileName,
    bytes: opts.bytes,
  });
}
