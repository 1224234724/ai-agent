// 知识库管理接口（需 admin JWT）
// GET  ?file=xxx.md → 已入库文档预览
// POST multipart action=upload → 解析入库 + preview
// POST JSON：toggle / add / remove（add/upload 均返回 preview）

import {
  addDocument,
  addDocumentFromFile,
  getDocStatuses,
  getDocumentDetail,
  removeDocument,
  setDocEnabled,
} from "@/lib/knowledge";
import {
  AuthError,
  authErrorResponse,
  getSessionFromRequest,
} from "@/lib/auth";
import { canAccessAdmin } from "@/lib/roles";

export const runtime = "nodejs";

type JsonAction =
  | { action: "toggle"; file: string; enabled: boolean }
  | { action: "add"; title: string; content: string }
  | { action: "remove"; file: string };

async function requireAdmin(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) throw new AuthError("未登录", 401);
  if (!canAccessAdmin(session.role)) throw new AuthError("无管理权限", 403);
  return session;
}

export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    const file = new URL(req.url).searchParams.get("file");
    if (!file) {
      return Response.json({ docs: await getDocStatuses() });
    }
    const preview = await getDocumentDetail(file);
    return Response.json({ ok: true, preview });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin(req);

    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      if (form.get("action") !== "upload") {
        return Response.json({ error: "未知操作" }, { status: 400 });
      }
      const file = form.get("file");
      if (!(file instanceof File)) {
        return Response.json({ error: "缺少文件" }, { status: 400 });
      }
      const result = await addDocumentFromFile(
        file.name,
        await file.arrayBuffer()
      );
      return Response.json({
        ok: true,
        file: result.file,
        preview: result.preview,
        docs: await getDocStatuses(),
      });
    }

    const body = (await req.json()) as JsonAction;
    if (body.action === "toggle" && typeof body.file === "string") {
      await setDocEnabled(body.file, body.enabled);
      return Response.json({ docs: await getDocStatuses() });
    }
    if (body.action === "add") {
      const result = await addDocument(body.title ?? "", body.content ?? "");
      return Response.json({
        ok: true,
        file: result.file,
        preview: result.preview,
        docs: await getDocStatuses(),
      });
    }
    if (body.action === "remove" && typeof body.file === "string") {
      await removeDocument(body.file);
      return Response.json({ docs: await getDocStatuses() });
    }
    return Response.json({ error: "未知操作" }, { status: 400 });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
