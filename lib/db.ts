// MySQL 访问层：连接池 + 建表 + 从旧 JSON 文件一次性迁移存量数据（仅 Node Runtime）

import { promises as fs } from "fs";
import path from "path";
import mysql from "mysql2/promise";
import type { Pool, QueryResult, RowDataPacket } from "mysql2/promise";

const DATA_DIR = path.join(process.cwd(), "data");
const MIGRATION_MARKER = path.join(DATA_DIR, ".mysql-migrated");

function config() {
  return {
    host: process.env.MYSQL_HOST || "localhost",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "root",
    database: process.env.MYSQL_DATABASE || "ai_agent",
    charset: "utf8mb4",
    connectionLimit: 10,
    timezone: "Z",
  };
}

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = mysql.createPool(config());
  }
  return pool;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    username VARCHAR(64) NOT NULL UNIQUE,
    password_hash CHAR(64) NOT NULL,
    name VARCHAR(128) NOT NULL DEFAULT '',
    role VARCHAR(32) NOT NULL,
    persona VARCHAR(32) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS conversations (
    id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    title VARCHAR(256) NOT NULL DEFAULT '',
    persona VARCHAR(64) NOT NULL DEFAULT '',
    messages JSON NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    PRIMARY KEY (user_id, id),
    INDEX idx_updated (updated_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    time DATETIME(3) NOT NULL,
    persona VARCHAR(64) NOT NULL,
    model VARCHAR(64) NOT NULL DEFAULT '',
    kb_hits INT NOT NULL DEFAULT 0,
    tool_calls JSON NULL,
    duration_ms INT NOT NULL DEFAULT 0,
    ok TINYINT(1) NOT NULL,
    user_name VARCHAR(64) NULL,
    INDEX idx_time (time),
    INDEX idx_persona (persona)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

let readyPromise: Promise<void> | null = null;

/** 确保建表完成并完成存量迁移（进程内只执行一次） */
export function ensureReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = (async () => {
      const p = getPool();
      for (const sql of SCHEMA) {
        await p.query(sql);
      }
      await migrateLegacyFiles(p);
    })().catch((err) => {
      readyPromise = null;
      throw err;
    });
  }
  return readyPromise;
}

/** 首次接入 MySQL 时，把旧的 JSON/JSONL 文件数据导入数据库（只做一次） */
async function migrateLegacyFiles(p: Pool): Promise<void> {
  try {
    await fs.access(MIGRATION_MARKER);
    return; // 已迁移过
  } catch {
    // 继续迁移
  }

  // users.json → users
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, "users.json"), "utf-8");
    const users = (JSON.parse(raw) as { users?: unknown[] }).users;
    if (Array.isArray(users) && users.length > 0) {
      const rows = users as Array<{
        id: string;
        username: string;
        passwordHash: string;
        name: string;
        role: string;
        persona: string;
      }>;
      for (const u of rows) {
        await p.query(
          `INSERT IGNORE INTO users (id, username, password_hash, name, role, persona)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [u.id, u.username, u.passwordHash, u.name, u.role, u.persona]
        );
      }
    }
  } catch {
    // 无旧文件则跳过
  }

  // data/conversations/{userId}/*.json → conversations
  try {
    const root = path.join(DATA_DIR, "conversations");
    const entries = await fs.readdir(root, { withFileTypes: true });
    for (const dir of entries.filter((e) => e.isDirectory())) {
      const files = await fs.readdir(path.join(root, dir.name));
      for (const name of files.filter((f) => f.endsWith(".json"))) {
        try {
          const raw = await fs.readFile(path.join(root, dir.name, name), "utf-8");
          const conv = JSON.parse(raw) as {
            id: string;
            title: string;
            persona: string;
            messages: unknown[];
            updatedAt: string;
          };
          await p.query(
            `INSERT IGNORE INTO conversations (id, user_id, title, persona, messages, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              conv.id,
              dir.name,
              conv.title ?? "",
              conv.persona ?? "",
              JSON.stringify(conv.messages ?? []),
              new Date(conv.updatedAt ?? Date.now()),
            ]
          );
        } catch {
          // 跳过损坏文件
        }
      }
    }
  } catch {
    // 无旧目录则跳过
  }

  // data/audit-log.jsonl → audit_logs
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, "audit-log.jsonl"), "utf-8");
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line) as {
          time: string;
          persona: string;
          model: string;
          kbHits: number;
          toolCalls: string[];
          durationMs: number;
          ok: boolean;
          user?: string;
        };
        await p.query(
          `INSERT INTO audit_logs (time, persona, model, kb_hits, tool_calls, duration_ms, ok, user_name)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            new Date(e.time),
            e.persona,
            e.model ?? "",
            e.kbHits ?? 0,
            JSON.stringify(e.toolCalls ?? []),
            e.durationMs ?? 0,
            e.ok ? 1 : 0,
            e.user ?? null,
          ]
        );
      } catch {
        // 忽略损坏的行
      }
    }
  } catch {
    // 无旧日志则跳过
  }

  await fs.writeFile(MIGRATION_MARKER, new Date().toISOString(), "utf-8");
}

/** 便捷查询：返回行数组 */
export async function query<T extends RowDataPacket = RowDataPacket>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  await ensureReady();
  const [rows] = await getPool().query<T[]>(sql, params);
  return rows;
}

/** 便捷执行：返回 ResultSetHeader */
export async function execute(
  sql: string,
  params?: unknown[]
): Promise<QueryResult> {
  await ensureReady();
  const [result] = await getPool().query(sql, params);
  return result;
}
