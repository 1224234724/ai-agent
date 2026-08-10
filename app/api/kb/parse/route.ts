// 文档解析预览接口（需 admin JWT，不入库）
// POST multipart/form-data: file
// 成功返回 { preview: ParsePreview }

import { parseUploadFile, UPLOAD_EXTENSIONS } from "@/lib/knowledge";
import {
  AuthError,
  authErrorResponse,
  getSessionFromRequest,
} from "@/lib/auth";
import { canAccessAdmin } from "@/lib/roles";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    endpoint: "/api/kb/parse",
    method: "POST",
    auth: "admin JWT Cookie",
    contentType: "multipart/form-data",
    fields: { file: `支持 ${UPLOAD_EXTENSIONS.join(" / ")}，≤2MB` },
    response: {
      preview: {
        title: "文档标题",
        content: "完整解析正文",
        previewText: "截断预览文本",
        charCount: 0,
        chunkCount: 0,
        chunks: ["前若干知识块"],
        sourceType: "markdown | text | csv | json",
      },
    },
    related: {
      uploadAndSave: "POST /api/kb  action=upload（解析并入库，同样返回 preview）",
      previewStored: "GET /api/kb?file=xxx.md",
      confirmSave: "POST /api/kb  action=add { title, content }",
    },
  });
}

export async function POST(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) throw new AuthError("未登录", 401);
    if (!canAccessAdmin(session.role)) throw new AuthError("无管理权限", 403);

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "缺少 file 字段" }, { status: 400 });
    }
    const preview = await parseUploadFile(file.name, await file.arrayBuffer());
    return Response.json({ ok: true, preview });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
