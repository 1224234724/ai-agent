import Link from "next/link";
import Chat from "./components/Chat";
import LogoutButton from "./components/LogoutButton";
import styles from "./page.module.css";
import { loadChunks } from "@/lib/knowledge";
import { TOOL_DEFINITIONS } from "@/lib/tools";
import { getSession } from "@/lib/auth";
import { ROLE_LABELS, canAccessAdmin } from "@/lib/roles";
import { PERSONAS } from "@/lib/personas";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");

  const modelName = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const isAdmin = canAccessAdmin(session.role);
  const agent = PERSONAS[session.persona];

  let kbStats = { docs: 0, chunks: 0 };
  try {
    const chunks = await loadChunks();
    kbStats = {
      docs: new Set(chunks.map((c) => c.doc)).size,
      chunks: chunks.length,
    };
  } catch {
    // 知识库目录缺失时不阻断页面渲染
  }

  return (
    <div className={`${styles.page} ${styles.workbench}`}>
      <main className={styles.main}>
        <nav className={styles.topNav}>
          <div className={styles.brandBlock}>
            <span className={styles.brand}>
              <span className={styles.brandGlyph} aria-hidden>
                AI
              </span>
              Agent Console
            </span>
            <div className={styles.metaRow} aria-label="平台概况">
              <span className={styles.metaChip}>
                知识库 <strong>{kbStats.docs}</strong>
              </span>
              <span className={styles.metaChip}>
                工具 <strong>{TOOL_DEFINITIONS.length}</strong>
              </span>
              <span className={styles.metaChip} title={modelName}>
                模型 <strong>{modelName}</strong>
              </span>
              <span className={styles.metaChip}>
                Agent <strong>{agent.name}</strong>
              </span>
            </div>
          </div>
          <div className={styles.navActions}>
            <span className={styles.userBadge}>
              {session.name}
              <em>{ROLE_LABELS[session.role]}</em>
            </span>
            {isAdmin && (
              <Link href="/admin" className={styles.navLink}>
                知识库管理
              </Link>
            )}
            <LogoutButton className={styles.navLink} />
          </div>
        </nav>

        <section id="chat" className={styles.chatSection}>
          <Chat
            kb={kbStats}
            userId={session.sub}
            lockedPersona={session.persona}
          />
        </section>
      </main>
    </div>
  );
}
