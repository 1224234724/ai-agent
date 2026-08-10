// 登录接口：校验企业账号，签发 JWT 并写入 HttpOnly Cookie

import {
  loginWithPassword,
  setAuthCookieHeader,
} from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/roles";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    username?: string;
    password?: string;
  };
  const username = (body.username ?? "").trim();
  const password = body.password ?? "";

  if (!username || !password) {
    return Response.json({ error: "请输入账号和密码" }, { status: 400 });
  }

  const result = await loginWithPassword(username, password);
  if (!result) {
    return Response.json({ error: "账号或密码错误" }, { status: 401 });
  }

  const { token, user } = result;
  return Response.json(
    {
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        roleLabel: ROLE_LABELS[user.role],
        persona: user.persona,
      },
    },
    {
      headers: {
        "Set-Cookie": setAuthCookieHeader(token),
      },
    }
  );
}
