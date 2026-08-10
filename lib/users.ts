// 企业用户：文件型账号表（仅 Node Runtime）

import { promises as fs } from "fs";
import path from "path";
import { createHash, timingSafeEqual } from "crypto";
import type { PersonaKey } from "@/lib/personas";
import { resolvePersona } from "@/lib/personas";
import type { Role } from "@/lib/roles";

export type { Role } from "@/lib/roles";
export { ROLE_LABELS, canAccessAdmin } from "@/lib/roles";

export type UserRecord = {
  id: string;
  username: string;
  passwordHash: string;
  name: string;
  role: Role;
  persona: PersonaKey;
};

export type PublicUser = Omit<UserRecord, "passwordHash">;

const USERS_PATH = path.join(process.cwd(), "data", "users.json");

function jwtSecret(): string {
  return process.env.JWT_SECRET || "dev-jwt-secret-change-me";
}

export function hashPassword(password: string): string {
  return createHash("sha256")
    .update(`${jwtSecret()}:${password}`)
    .digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

async function readUsers(): Promise<UserRecord[]> {
  try {
    const raw = await fs.readFile(USERS_PATH, "utf-8");
    const data = JSON.parse(raw) as { users?: UserRecord[] };
    return Array.isArray(data.users) ? data.users : [];
  } catch {
    return [];
  }
}

function toPublic(user: UserRecord): PublicUser {
  const { passwordHash: _, ...rest } = user;
  return {
    ...rest,
    persona: resolvePersona(rest.persona),
  };
}

export async function findUserByUsername(
  username: string
): Promise<UserRecord | null> {
  const users = await readUsers();
  return (
    users.find(
      (u) => u.username.toLowerCase() === username.trim().toLowerCase()
    ) ?? null
  );
}

export async function authenticate(
  username: string,
  password: string
): Promise<PublicUser | null> {
  const user = await findUserByUsername(username);
  if (!user) return null;
  if (!safeEqualHex(user.passwordHash, hashPassword(password))) return null;
  return toPublic(user);
}
