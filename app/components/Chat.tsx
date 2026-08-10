"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import styles from "../page.module.css";
import { PERSONAS, resolvePersona, type PersonaKey } from "@/lib/personas";

type Message = { role: "user" | "assistant"; content: string };
type ConvItem = {
  id: string;
  title: string;
  updatedAt: string;
  messages: Message[];
};

export default function Chat({
  kb,
  userId,
  lockedPersona,
}: {
  kb: { docs: number; chunks: number };
  userId: string;
  lockedPersona: PersonaKey;
}) {
  const persona = resolvePersona(lockedPersona);
  const active = PERSONAS[persona];
  const convKey = `agent_conv_id_${userId}`;

  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: active.greeting },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<ConvItem[]>([]);
  const [activeId, setActiveId] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const convIdRef = useRef("");
  const abortRef = useRef<AbortController | null>(null);
  const restoredRef = useRef(false);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  async function refreshHistory() {
    try {
      const res = await fetch("/api/conversations");
      const data = await res.json();
      setHistory(data.conversations ?? []);
    } catch {
      // 忽略
    }
  }

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    refreshHistory().then(() => {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(convKey);
      } catch {
        return;
      }
      if (!saved) return;
      fetch("/api/conversations")
        .then((r) => r.json())
        .then((data) => {
          const conv = (data.conversations ?? []).find(
            (c: ConvItem) => c.id === saved
          );
          if (!conv?.messages?.length) return;
          convIdRef.current = saved!;
          setActiveId(saved!);
          setMessages(conv.messages);
        })
        .catch(() => {});
    });
  }, [convKey]);

  function newConvId() {
    const id = `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    convIdRef.current = id;
    setActiveId(id);
    try {
      localStorage.setItem(convKey, id);
    } catch {
      // 忽略
    }
    return id;
  }

  function persist(finalMessages: Message[]) {
    const userMsgs = finalMessages.filter((m) => m.role === "user");
    if (!userMsgs.length) return;
    const id = convIdRef.current || newConvId();
    fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        title: userMsgs[0].content,
        persona,
        messages: finalMessages,
      }),
    })
      .then(() => refreshHistory())
      .catch(() => {});
  }

  function startNewChat() {
    if (loading) return;
    convIdRef.current = "";
    setActiveId("");
    try {
      localStorage.removeItem(convKey);
    } catch {
      // 忽略
    }
    setMessages([{ role: "assistant", content: active.greeting }]);
    setInput("");
  }

  function openHistory(conv: ConvItem) {
    if (loading) return;
    convIdRef.current = conv.id;
    setActiveId(conv.id);
    try {
      localStorage.setItem(convKey, conv.id);
    } catch {
      // 忽略
    }
    setMessages(conv.messages);
  }

  async function deleteHistory(id: string) {
    if (loading) return;
    await fetch(`/api/conversations?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }).catch(() => {});
    if (convIdRef.current === id) startNewChat();
    refreshHistory();
  }

  function stopGeneration() {
    abortRef.current?.abort();
  }

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    const next: Message[] = [...messages, { role: "user", content }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;
    let finalMessages: Message[] = next;
    let aborted = false;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `请求失败: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        finalMessages = [...next, { role: "assistant", content: acc }];
        setMessages(finalMessages);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        aborted = true;
      } else {
        finalMessages = [
          ...next,
          { role: "assistant", content: `出错了：${(err as Error).message}` },
        ];
        setMessages(finalMessages);
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
      if (aborted) {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== "assistant") return prev;
          const copy = [...prev];
          copy[copy.length - 1] = {
            role: "assistant",
            content: (last.content || "") + "\n\n[已停止生成]",
          };
          return copy;
        });
      }
      persist(finalMessages);
    }
  }

  return (
    <div className={styles.chatLayout}>
      <aside className={styles.historyPanel} aria-label="历史会话">
        <div className={styles.historyHead}>
          <strong>历史会话</strong>
          <button
            type="button"
            className={styles.historyNew}
            onClick={startNewChat}
            disabled={loading}
          >
            新建
          </button>
        </div>
        <ul className={styles.historyList}>
          {history.length === 0 && (
            <li className={styles.historyEmpty}>暂无历史，发送消息后自动保存</li>
          )}
          {history.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={`${styles.historyItem} ${
                  activeId === c.id ? styles.historyItemActive : ""
                }`}
                onClick={() => openHistory(c)}
                disabled={loading}
              >
                <span className={styles.historyTitle}>
                  {c.title || "未命名对话"}
                </span>
                <span className={styles.historyTime}>
                  {new Date(c.updatedAt).toLocaleString("zh-CN", {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </button>
              <button
                type="button"
                className={styles.historyDel}
                onClick={() => deleteHistory(c.id)}
                disabled={loading}
                title="删除会话"
              >
                删
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className={styles.chatCard}>
        <div className={styles.personaRow}>
          <div className={styles.lockedAgent}>
            <Image
              src={active.avatar}
              alt={active.name}
              width={36}
              height={36}
              className={styles.personaAvatar}
            />
            <div>
              <strong>
                {active.name}
                <em>账号绑定</em>
              </strong>
              <span>{active.title} · 本账号对话仅使用此 Agent</span>
            </div>
          </div>
          {kb.docs > 0 && (
            <span className={styles.kbBadge}>
              知识库 {kb.docs} 篇 · {kb.chunks} 块
            </span>
          )}
          <button
            className={styles.clearBtn}
            onClick={startNewChat}
            disabled={loading || messages.length <= 1}
          >
            清空
          </button>
        </div>

        <div ref={listRef} className={styles.chatList}>
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className={styles.user}>
                <span className={styles.role}>我</span>
                <p className={styles.bubble}>{m.content}</p>
              </div>
            ) : (
              <div key={i} className={styles.bot}>
                <div className={styles.botHead}>
                  <Image
                    src={active.avatar}
                    alt={active.name}
                    width={36}
                    height={36}
                    className={styles.botAvatar}
                  />
                  <span className={styles.role}>
                    {active.name} · {active.title}
                  </span>
                </div>
                <p className={styles.bubble}>
                  {m.content ||
                    (loading && i === messages.length - 1 ? (
                      <span className={styles.typingDots}>
                        <i />
                        <i />
                        <i />
                      </span>
                    ) : (
                      ""
                    ))}
                </p>
              </div>
            )
          )}
        </div>

        <div className={styles.suggestionRow}>
          {active.suggestions.map((s) => (
            <button
              key={s}
              className={styles.suggestion}
              onClick={() => send(s)}
              disabled={loading}
            >
              {s}
            </button>
          ))}
        </div>

        <div className={styles.inputRow}>
          <input
            className={styles.input}
            value={input}
            placeholder={`向${active.name}提问…`}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) send();
            }}
            disabled={loading}
          />
          <button
            className={styles.sendBtn}
            onClick={() => send()}
            disabled={loading}
          >
            {loading ? "生成中…" : "发送"}
          </button>
          {loading && (
            <button className={styles.stopBtn} onClick={stopGeneration}>
              停止
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
