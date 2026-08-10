import type { Metadata } from "next";
import Link from "next/link";
import AdminPanel from "../components/AdminPanel";
import LogoutButton from "../components/LogoutButton";
import { getDocStatuses } from "@/lib/knowledge";
import { getSession } from "@/lib/auth";
import { readStats } from "@/lib/audit";
import { ROLE_LABELS } from "@/lib/roles";
import { redirect } from "next/navigation";
import shell from "../page.module.css";
import styles from "../admin.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "知识库管理 · AI Agent 控制台",
};

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  let docs: Awaited<ReturnType<typeof getDocStatuses>> = [];
  try {
    docs = await getDocStatuses();
  } catch {
    // 知识库目录异常时展示空列表，不阻断后台
  }
  const stats = await readStats();

  const statItems = [
    { value: String(stats.total), label: "累计对话" },
    { value: String(stats.today), label: "今日对话" },
    { value: String(stats.kbHitRequests), label: "知识库命中" },
    { value: String(stats.toolCallTotal), label: "工具调用" },
    { value: `${Math.round(stats.avgDurationMs)} ms`, label: "平均响应" },
  ];

  return (
    <div className={shell.page}>
      <main className={`${shell.main} ${styles.adminMain}`}>
        <nav className={shell.topNav}>
          <span className={shell.brand}>
            <span className={shell.brandGlyph} aria-hidden>
              AI
            </span>
            Agent Console
          </span>
          <div className={shell.navActions}>
            <span className={shell.userBadge}>
              {session.name}
              <em>{ROLE_LABELS[session.role]}</em>
            </span>
            <Link href="/" className={shell.navLink}>
              返回工作台
            </Link>
            <LogoutButton className={shell.navLink} />
          </div>
        </nav>

        <header className={shell.hero}>
          <div className={shell.heroCopy}>
            <p className={shell.heroEyebrow}>Knowledge Admin</p>
            <h1 className={shell.heroTitle}>知识库管理</h1>
            <p className={shell.heroDesc}>
              启用、停用、上传与新增知识文档；停用后 Agent 不再引用该文档。
            </p>
          </div>
          <div className={shell.heroActions}>
            <Link href="/" className={shell.heroCta}>
              返回工作台
            </Link>
            <LogoutButton className={shell.heroCtaGhost} />
          </div>
        </header>

        <div className={`${shell.statsBar} ${styles.statsFive}`}>
          {statItems.map((s) => (
            <div key={s.label} className={shell.statCell}>
              <strong>{s.value}</strong>
              <span>{s.label}</span>
            </div>
          ))}
        </div>

        <AdminPanel initialDocs={docs} />
      </main>
    </div>
  );
}
