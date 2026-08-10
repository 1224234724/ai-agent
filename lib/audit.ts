// 审计日志与用量统计：每次对话追加一条 JSONL 记录（data/audit-log.jsonl）
// 后台页面 SSR 时汇总展示

import { promises as fs } from "fs";
import path from "path";

const LOG_PATH = path.join(process.cwd(), "data", "audit-log.jsonl");

export type AuditEntry = {
  time: string;
  persona: string;
  model: string;
  kbHits: number;
  toolCalls: string[];
  durationMs: number;
  ok: boolean;
  user?: string;
};

export async function appendAudit(entry: AuditEntry): Promise<void> {
  try {
    await fs.appendFile(LOG_PATH, JSON.stringify(entry) + "\n", "utf-8");
  } catch {
    // 审计失败不影响对话主流程
  }
}

export type AuditStats = {
  total: number;
  today: number;
  kbHitRequests: number;
  toolCallTotal: number;
  avgDurationMs: number;
  byPersona: Record<string, number>;
};

export async function readStats(): Promise<AuditStats> {
  let raw = "";
  try {
    raw = await fs.readFile(LOG_PATH, "utf-8");
  } catch {
    raw = "";
  }

  const todayPrefix = new Date().toISOString().slice(0, 10);
  const stats: AuditStats = {
    total: 0,
    today: 0,
    kbHitRequests: 0,
    toolCallTotal: 0,
    avgDurationMs: 0,
    byPersona: {},
  };
  let durationSum = 0;

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as AuditEntry;
      stats.total++;
      if (entry.time.startsWith(todayPrefix)) stats.today++;
      if (entry.kbHits > 0) stats.kbHitRequests++;
      stats.toolCallTotal += entry.toolCalls?.length ?? 0;
      durationSum += entry.durationMs ?? 0;
      stats.byPersona[entry.persona] = (stats.byPersona[entry.persona] ?? 0) + 1;
    } catch {
      // 忽略损坏的行
    }
  }
  if (stats.total) {
    stats.avgDurationMs = Math.round(durationSum / stats.total);
  }
  return stats;
}
