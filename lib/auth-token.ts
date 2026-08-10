// JWT 工具：Edge Middleware 与 Node 共用（仅依赖 jose，无 fs/path）

import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { isRole, type Role } from "@/lib/roles";
import { resolvePersona, type PersonaKey } from "@/lib/personas";

export const AUTH_COOKIE = "agent_token";
export const AUTH_MAX_AGE = 60 * 60 * 24; // 24h

export type SessionPayload = {
  sub: string;
  username: string;
  name: string;
  role: Role;
  persona: PersonaKey;
};

function secretKey() {
  const secret = process.env.JWT_SECRET || "dev-jwt-secret-change-me";
  return new TextEncoder().encode(secret);
}

export function cookieOptions(maxAge = AUTH_MAX_AGE): string {
  // Secure 默认随生产环境开启；纯 HTTP 部署可用 COOKIE_SECURE=false 关闭
  const secure =
    process.env.COOKIE_SECURE !== undefined
      ? process.env.COOKIE_SECURE === "true"
      : process.env.NODE_ENV === "production";
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export function setAuthCookieHeader(token: string): string {
  return `${AUTH_COOKIE}=${token}; ${cookieOptions()}`;
}

export function clearAuthCookieHeader(): string {
  return `${AUTH_COOKIE}=; ${cookieOptions(0)}`;
}

export async function signToken(input: {
  id: string;
  username: string;
  name: string;
  role: Role;
  persona: PersonaKey;
}): Promise<string> {
  return new SignJWT({
    username: input.username,
    name: input.name,
    role: input.role,
    persona: resolvePersona(input.persona),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(input.id)
    .setIssuedAt()
    .setExpirationTime(`${AUTH_MAX_AGE}s`)
    .sign(secretKey());
}

export async function verifyToken(
  token: string | undefined | null
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return normalizePayload(payload);
  } catch {
    return null;
  }
}

function normalizePayload(payload: JWTPayload): SessionPayload | null {
  const sub = typeof payload.sub === "string" ? payload.sub : "";
  const username =
    typeof payload.username === "string" ? payload.username : "";
  const name = typeof payload.name === "string" ? payload.name : username;
  if (!sub || !username || !isRole(payload.role)) return null;
  return {
    sub,
    username,
    name,
    role: payload.role,
    persona: resolvePersona(
      typeof payload.persona === "string" ? payload.persona : undefined
    ),
  };
}
