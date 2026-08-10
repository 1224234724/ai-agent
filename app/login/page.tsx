import type { Metadata } from "next";
import LoginForm from "../components/LoginForm";
import styles from "./login.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "登录 · AI Agent 控制台",
  description: "企业级 AI Agent 平台登录（JWT）",
};

export default function LoginPage() {
  return (
    <div className={styles.page}>
      <aside className={styles.brandPanel} aria-label="产品品牌">
        <div className={styles.brandTop}>
          <div className={styles.logoMark}>
            <span className={styles.logoGlyph} aria-hidden>
              AI
            </span>
            <span className={styles.logoText}>Agent Console</span>
          </div>
          <h1 className={styles.brandName}>AI Agent 控制台</h1>
          <p className={styles.brandTagline}>
            统一身份登录，按角色分配工作台与管理权限，保障企业知识与对话安全可控。
          </p>
        </div>
        <div className={styles.brandBottom}>
          <div className={styles.brandMeta}>
            <div>
              <strong>JWT 鉴权</strong>
              HttpOnly Cookie 会话
            </div>
            <div>
              <strong>角色隔离</strong>
              管理员 / 运营 / 分析师
            </div>
            <div>
              <strong>默认 Agent</strong>
              账号绑定人设
            </div>
          </div>
        </div>
      </aside>

      <main className={styles.formPanel}>
        <LoginForm />
      </main>
    </div>
  );
}
