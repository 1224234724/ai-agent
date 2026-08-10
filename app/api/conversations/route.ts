// 对话历史接口（需登录，按用户隔离）

import {
  deleteConversation,
  listConversations,
  saveConversation,
  type Conversation,
} from "@/lib/conversations";
import {
  AuthError,
  authErrorResponse,
  getSessionFromRequest,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) throw new AuthError("未登录", 401);
    return Response.json({
      conversations: await listConversations(session.sub),
    });
  } catch (err) {
    return authErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) throw new AuthError("未登录", 401);
    const body = (await req.json()) as Conversation;
    if (!body.id || !Array.isArray(body.messages)) {
      return Response.json({ error: "参数不完整" }, { status: 400 });
    }
    await saveConversation(session.sub, {
      id: body.id,
      title: (body.title ?? "新对话").slice(0, 40),
      persona: body.persona ?? session.persona,
      messages: body.messages,
      updatedAt: new Date().toISOString(),
    });
    return Response.json({ ok: true });
  } catch (err) {
    return authErrorResponse(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) throw new AuthError("未登录", 401);
    const id = new URL(req.url).searchParams.get("id") ?? "";
    if (!id) {
      return Response.json({ error: "缺少 id" }, { status: 400 });
    }
    await deleteConversation(session.sub, id);
    return Response.json({ ok: true });
  } catch (err) {
    return authErrorResponse(err);
  }
}
