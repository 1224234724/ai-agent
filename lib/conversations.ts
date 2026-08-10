// 对话持久化：MySQL conversations 表，按用户隔离

import type { RowDataPacket } from "mysql2/promise";
import { execute, query } from "@/lib/db";

export type StoredMessage = { role: "user" | "assistant"; content: string };

export type Conversation = {
  id: string;
  title: string;
  persona: string;
  messages: StoredMessage[];
  updatedAt: string;
};

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
}

function safeUser(userId: string): string {
  return safeId(userId) || "anonymous";
}

type ConversationRow = RowDataPacket & {
  id: string;
  title: string;
  persona: string;
  messages: StoredMessage[] | string;
  updated_at: Date;
};

function toConversation(row: ConversationRow): Conversation {
  const messages =
    typeof row.messages === "string"
      ? (JSON.parse(row.messages) as StoredMessage[])
      : row.messages;
  return {
    id: row.id,
    title: row.title,
    persona: row.persona,
    messages: Array.isArray(messages) ? messages : [],
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function saveConversation(
  userId: string,
  conv: Conversation
): Promise<void> {
  await execute(
    `INSERT INTO conversations (id, user_id, title, persona, messages, updated_at)
     VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE
       title = VALUES(title),
       persona = VALUES(persona),
       messages = VALUES(messages),
       updated_at = VALUES(updated_at)`,
    [
      safeId(conv.id),
      safeUser(userId),
      conv.title ?? "",
      conv.persona ?? "",
      JSON.stringify(conv.messages ?? []),
    ]
  );
}

export async function listConversations(
  userId: string
): Promise<Conversation[]> {
  try {
    const rows = await query<ConversationRow>(
      `SELECT id, title, persona, messages, updated_at
       FROM conversations WHERE user_id = ? ORDER BY updated_at DESC`,
      [safeUser(userId)]
    );
    return rows.map(toConversation);
  } catch {
    return [];
  }
}

export async function deleteConversation(
  userId: string,
  id: string
): Promise<void> {
  try {
    await execute(
      `DELETE FROM conversations WHERE user_id = ? AND id = ?`,
      [safeUser(userId), safeId(id)]
    );
  } catch {
    // 已不存在则忽略
  }
}
