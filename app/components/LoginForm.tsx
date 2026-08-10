"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "../login/login.module.css";

const DEMO_ACCOUNTS = [
  { user: "admin", pass: "admin123", role: "系统管理员" },
  { user: "zhangsan", pass: "zs123456", role: "知识运营" },
  { user: "lisi", pass: "ls123456", role: "业务分析师" },
];

export default function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!username.trim() || !password || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "登录失败");
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function fillDemo(user: string, pass: string) {
    setUsername(user);
    setPassword(pass);
    setError("");
  }

  return (
    <div className={styles.formShell}>
      <p className={styles.formEyebrow}>Secure Access · JWT</p>
      <h2 className={styles.formTitle}>企业账号登录</h2>
      <p className={styles.formDesc}>
        请使用分配的企业账号进入工作台。不同角色拥有独立权限与默认
        Agent。
      </p>

      <form className={styles.form} onSubmit={submit}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="login-username">
            账号
          </label>
          <input
            id="login-username"
            className={styles.input}
            type="text"
            name="username"
            autoComplete="username"
            value={username}
            placeholder="请输入企业账号"
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="login-password">
            密码
          </label>
          <input
            id="login-password"
            className={styles.input}
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            placeholder="请输入密码"
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}

        <button
          type="submit"
          className={styles.submit}
          disabled={busy || !username.trim() || !password}
        >
          {busy ? "正在验证…" : "登录工作台"}
        </button>
      </form>

      <div className={styles.demoBox}>
        <p className={styles.demoTitle}>演示账号</p>
        <ul className={styles.demoList}>
          {DEMO_ACCOUNTS.map((a) => (
            <li key={a.user}>
              <button
                type="button"
                className={styles.demoBtn}
                onClick={() => fillDemo(a.user, a.pass)}
              >
                <strong>{a.user}</strong>
                <span>{a.role}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.formFoot}>
        <span>JWT 会话有效期 24 小时</span>
      </div>
    </div>
  );
}
