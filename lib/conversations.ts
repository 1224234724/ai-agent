// 对话持久化：按用户隔离存储 data/conversations/{userId}/

import { promises as fs } from "fs";
import path from "path";

const STORE_ROOT = path.join(process.cwd(), "data", "conversations");

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

function userDir(userId: string): string {
  return path.join(STORE_ROOT, safeId(userId) || "anonymous");
}

async function ensureDir(userId: string): Promise<string> {
  const dir = userDir(userId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function saveConversation(
  userId: string,
  conv: Conversation
): Promise<void> {
  const dir = await ensureDir(userId);
  const file = path.join(dir, `${safeId(conv.id)}.json`);
  await fs.writeFile(
    file,
    JSON.stringify({ ...conv, updatedAt: new Date().toISOString() }, null, 2),
    "utf-8"
  );
}

export async function listConversations(
  userId: string
): Promise<Conversation[]> {
  try {
    const dir = await ensureDir(userId);
    const files = await fs.readdir(dir);
    const list: Conversation[] = [];
    for (const name of files.filter((f) => f.endsWith(".json"))) {
      try {
        const raw = await fs.readFile(path.join(dir, name), "utf-8");
        list.push(JSON.parse(raw) as Conversation);
      } catch {
        // 跳过损坏文件
      }
    }
    return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

export async function deleteConversation(
  userId: string,
  id: string
): Promise<void> {
  const file = path.join(userDir(userId), `${safeId(id)}.json`);
  try {
    await fs.unlink(file);
  } catch {
    // 已不存在则忽略
  }
}
