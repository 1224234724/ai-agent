// 企业用户：MySQL 账号表（仅 Node Runtime）

import { createHash, timingSafeEqual } from "crypto";
import type { RowDataPacket } from "mysql2/promise";
import { query } from "@/lib/db";
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

type UserRow = RowDataPacket & {
  id: string;
  username: string;
  password_hash: string;
  name: string;
  role: Role;
  persona: PersonaKey;
};

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

function toRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    name: row.name,
    role: row.role,
    persona: row.persona,
  };
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
  const rows = await query<UserRow>(
    `SELECT id, username, password_hash, name, role, persona
     FROM users WHERE LOWER(username) = LOWER(TRIM(?)) LIMIT 1`,
    [username]
  );
  return rows.length > 0 ? toRecord(rows[0]) : null;
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
