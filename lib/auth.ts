// Node 侧鉴权：登录、Cookie 会话读取（依赖 users，不可用于 Edge Middleware）

import { cookies } from "next/headers";
import { authenticate, type PublicUser } from "@/lib/users";
import { canAccessAdmin } from "@/lib/roles";
import {
  AUTH_COOKIE,
  clearAuthCookieHeader,
  setAuthCookieHeader,
  signToken,
  verifyToken,
  type SessionPayload,
} from "@/lib/auth-token";

export {
  AUTH_COOKIE,
  clearAuthCookieHeader,
  setAuthCookieHeader,
  verifyToken,
  type SessionPayload,
} from "@/lib/auth-token";

export async function loginWithPassword(
  username: string,
  password: string
): Promise<{ token: string; user: PublicUser } | null> {
  const user = await authenticate(username, password);
  if (!user) return null;
  const token = await signToken(user);
  return { token, user };
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifyToken(store.get(AUTH_COOKIE)?.value);
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new AuthError("未登录", 401);
  return session;
}

export async function requireAdmin(): Promise<SessionPayload> {
  const session = await requireSession();
  if (!canAccessAdmin(session.role)) {
    throw new AuthError("无管理权限", 403);
  }
  return session;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function authErrorResponse(err: unknown): Response {
  if (err instanceof AuthError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  return Response.json({ error: "鉴权失败" }, { status: 401 });
}

export async function getSessionFromRequest(
  req: Request
): Promise<SessionPayload | null> {
  const raw = req.headers.get("cookie") ?? "";
  const token = raw
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${AUTH_COOKIE}=`))
    ?.slice(AUTH_COOKIE.length + 1);
  return verifyToken(token);
}
