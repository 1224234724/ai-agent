// 审计日志与用量统计：每次对话追加一条记录到 MySQL audit_logs 表
// 后台页面 SSR 时汇总展示

import type { RowDataPacket } from "mysql2/promise";
import { execute, query } from "@/lib/db";

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
    await execute(
      `INSERT INTO audit_logs (time, persona, model, kb_hits, tool_calls, duration_ms, ok, user_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        new Date(entry.time),
        entry.persona,
        entry.model ?? "",
        entry.kbHits ?? 0,
        JSON.stringify(entry.toolCalls ?? []),
        entry.durationMs ?? 0,
        entry.ok ? 1 : 0,
        entry.user ?? null,
      ]
    );
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

type SummaryRow = RowDataPacket & {
  total: number | string;
  today: number | string;
  kbHitRequests: number | string;
  toolCallTotal: number | string | null;
  avgDurationMs: number | string | null;
};

type PersonaRow = RowDataPacket & {
  persona: string;
  cnt: number | string;
};

function num(v: number | string | null | undefined): number {
  return v == null ? 0 : Number(v);
}

export async function readStats(): Promise<AuditStats> {
  const stats: AuditStats = {
    total: 0,
    today: 0,
    kbHitRequests: 0,
    toolCallTotal: 0,
    avgDurationMs: 0,
    byPersona: {},
  };
  try {
    const [s] = await query<SummaryRow>(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(time >= UTC_DATE()), 0) AS today,
              COALESCE(SUM(kb_hits > 0), 0) AS kbHitRequests,
              COALESCE(SUM(JSON_LENGTH(tool_calls)), 0) AS toolCallTotal,
              AVG(duration_ms) AS avgDurationMs
       FROM audit_logs`
    );
    stats.total = num(s?.total);
    stats.today = num(s?.today);
    stats.kbHitRequests = num(s?.kbHitRequests);
    stats.toolCallTotal = num(s?.toolCallTotal);
    stats.avgDurationMs = Math.round(num(s?.avgDurationMs));

    const personas = await query<PersonaRow>(
      `SELECT persona, COUNT(*) AS cnt FROM audit_logs GROUP BY persona`
    );
    for (const row of personas) {
      stats.byPersona[row.persona] = num(row.cnt);
    }
  } catch {
    // 数据库不可用时返回空统计
  }
  return stats;
}
