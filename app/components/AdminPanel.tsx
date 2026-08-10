"use client";

import { useRef, useState } from "react";
import type { DocStatus, ParsePreview } from "@/lib/knowledge";
import styles from "../admin.module.css";

export default function AdminPanel({
  initialDocs,
}: {
  initialDocs: DocStatus[];
}) {
  const [docs, setDocs] = useState(initialDocs);
  const [busy, setBusy] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<ParsePreview | null>(null);
  const [pendingParse, setPendingParse] = useState<ParsePreview | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const parseInputRef = useRef<HTMLInputElement>(null);

  async function callApi(body: Record<string, unknown>) {
    const res = await fetch("/api/kb", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `请求失败: ${res.status}`);
    if (data.docs) setDocs(data.docs);
    return data;
  }

  async function toggle(doc: DocStatus) {
    setBusy(doc.file);
    setNotice("");
    try {
      await callApi({ action: "toggle", file: doc.file, enabled: !doc.enabled });
      setNotice(doc.enabled ? `已停用《${doc.title}》` : `已启用《${doc.title}》`);
    } catch (err) {
      setNotice(`操作失败：${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function remove(doc: DocStatus) {
    if (!window.confirm(`确定删除《${doc.title}》？该操作不可恢复。`)) return;
    setBusy(doc.file);
    setNotice("");
    try {
      await callApi({ action: "remove", file: doc.file });
      if (preview?.file === doc.file) setPreview(null);
      setNotice(`已删除《${doc.title}》`);
    } catch (err) {
      setNotice(`删除失败：${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function viewDoc(doc: DocStatus) {
    setBusy(`view-${doc.file}`);
    setNotice("");
    try {
      const res = await fetch(`/api/kb?file=${encodeURIComponent(doc.file)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "读取失败");
      setPreview(data.preview);
      setPendingParse(null);
      setNotice(`已加载《${doc.title}》预览`);
    } catch (err) {
      setNotice(`预览失败：${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  /** 仅解析：POST /api/kb/parse */
  async function parseOnly(file: File) {
    setBusy("__parse__");
    setNotice("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/kb/parse", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "解析失败");
      setPendingParse(data.preview);
      setPreview(data.preview);
      setTitle(data.preview.title);
      setContent(data.preview.content);
      setNotice(
        `解析成功：${data.preview.charCount} 字 / ${data.preview.chunkCount} 块，可确认入库`
      );
    } catch (err) {
      setNotice(`解析失败：${(err as Error).message}`);
    } finally {
      if (parseInputRef.current) parseInputRef.current.value = "";
      setBusy(null);
    }
  }

  /** 解析并直接入库：POST /api/kb action=upload */
  async function uploadAndSave(file: File) {
    setBusy("__upload__");
    setNotice("");
    try {
      const form = new FormData();
      form.append("action", "upload");
      form.append("file", file);
      const res = await fetch("/api/kb", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `上传失败: ${res.status}`);
      setDocs(data.docs);
      setPreview(data.preview);
      setPendingParse(null);
      setNotice(`《${file.name}》已解析入库 · ${data.preview.chunkCount} 知识块`);
    } catch (err) {
      setNotice(`上传失败：${(err as Error).message}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
      setBusy(null);
    }
  }

  async function confirmParsedSave() {
    if (!pendingParse || busy) return;
    setBusy("__add__");
    setNotice("");
    try {
      const data = await callApi({
        action: "add",
        title: pendingParse.title,
        content: pendingParse.content,
      });
      setPreview(data.preview);
      setPendingParse(null);
      setTitle("");
      setContent("");
      setNotice("解析结果已入库并启用");
    } catch (err) {
      setNotice(`入库失败：${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function submitAdd() {
    if (!title.trim() || !content.trim() || busy) return;
    setBusy("__add__");
    setNotice("");
    try {
      const data = await callApi({ action: "add", title, content });
      setTitle("");
      setContent("");
      setPreview(data.preview);
      setPendingParse(null);
      setNotice("文档已添加并自动启用");
    } catch (err) {
      setNotice(`添加失败：${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function enableAll(enabled: boolean) {
    setBusy("__batch__");
    setNotice("");
    try {
      for (const doc of docs) {
        if (doc.enabled !== enabled) {
          await callApi({ action: "toggle", file: doc.file, enabled });
        }
      }
      setNotice(enabled ? "已全部启用" : "已全部停用");
    } catch (err) {
      setNotice(`批量操作失败：${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  const enabledCount = docs.filter((d) => d.enabled).length;
  const filtered = docs.filter((d) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      d.title.toLowerCase().includes(q) || d.file.toLowerCase().includes(q)
    );
  });

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <div className={styles.summary}>
          共 {docs.length} 篇，已启用 {enabledCount} 篇 · 接口{" "}
          <code>POST /api/kb/parse</code>（预览）/{" "}
          <code>POST /api/kb</code>（入库）
        </div>
        <div className={styles.toolbarActions}>
          <input
            className={styles.searchInput}
            value={query}
            placeholder="搜索文档标题 / 文件名"
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            className={styles.ghostBtn}
            onClick={() => enableAll(true)}
            disabled={busy !== null}
          >
            全部启用
          </button>
          <button
            className={styles.ghostBtn}
            onClick={() => enableAll(false)}
            disabled={busy !== null}
          >
            全部停用
          </button>
        </div>
      </div>

      {notice && <div className={styles.notice}>{notice}</div>}

      {(preview || pendingParse) && (
        <div className={styles.previewCard}>
          <div className={styles.previewHead}>
            <h2>解析预览 · {(preview ?? pendingParse)!.title}</h2>
            <span>
              {(preview ?? pendingParse)!.charCount} 字 ·{" "}
              {(preview ?? pendingParse)!.chunkCount} 块 ·{" "}
              {(preview ?? pendingParse)!.sourceType}
              {(preview ?? pendingParse)!.file
                ? ` · ${(preview ?? pendingParse)!.file}`
                : " · 未入库"}
            </span>
          </div>
          <pre className={styles.previewBody}>
            {(preview ?? pendingParse)!.previewText}
          </pre>
          {(preview ?? pendingParse)!.chunks.length > 0 && (
            <div className={styles.chunkList}>
              {(preview ?? pendingParse)!.chunks.map((c, i) => (
                <div key={i} className={styles.chunkItem}>
                  <strong>块 {i + 1}</strong>
                  <p>{c.length > 160 ? `${c.slice(0, 160)}…` : c}</p>
                </div>
              ))}
            </div>
          )}
          {pendingParse && (
            <div className={styles.previewActions}>
              <button
                className={styles.addBtn}
                onClick={confirmParsedSave}
                disabled={busy !== null}
              >
                {busy === "__add__" ? "入库中…" : "确认入库并启用"}
              </button>
              <button
                className={styles.ghostBtn}
                onClick={() => {
                  setPendingParse(null);
                  setPreview(null);
                }}
                disabled={busy !== null}
              >
                丢弃预览
              </button>
            </div>
          )}
        </div>
      )}

      <ul className={styles.docList}>
        {filtered.length === 0 && (
          <li className={styles.emptyRow}>
            {docs.length === 0
              ? "暂无知识文档，请先解析或上传。"
              : "没有匹配的文档。"}
          </li>
        )}
        {filtered.map((doc) => (
          <li key={doc.file} className={styles.docRow}>
            <div className={styles.docInfo}>
              <span className={styles.docTitle}>{doc.title}</span>
              <span className={styles.docMeta}>
                {doc.file} · {doc.chunks} 块
              </span>
            </div>
            <span
              className={`${styles.statusBadge} ${
                doc.enabled ? styles.statusOn : styles.statusOff
              }`}
            >
              {doc.enabled ? "已启用" : "已停用"}
            </span>
            <button
              className={styles.ghostBtn}
              onClick={() => viewDoc(doc)}
              disabled={busy !== null}
            >
              {busy === `view-${doc.file}` ? "…" : "预览"}
            </button>
            <button
              className={styles.toggleBtn}
              onClick={() => toggle(doc)}
              disabled={busy !== null}
            >
              {busy === doc.file ? "处理中…" : doc.enabled ? "停用" : "启用"}
            </button>
            <button
              className={styles.removeBtn}
              onClick={() => remove(doc)}
              disabled={busy !== null}
            >
              删除
            </button>
          </li>
        ))}
      </ul>

      <div className={styles.addCard}>
        <h2>① 解析预览（不入库）</h2>
        <p className={styles.addHint}>
          接口 <code>POST /api/kb/parse</code>，字段 <code>file</code>。支持 .md /
          .txt / .csv / .json（≤2MB）。解析成功后下方展示预览，可再确认入库。
        </p>
        <label className={styles.uploadBtn}>
          {busy === "__parse__" ? "解析中…" : "选择文件解析"}
          <input
            ref={parseInputRef}
            className={styles.fileInput}
            type="file"
            accept=".md,.txt,.csv,.json"
            disabled={busy !== null}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) parseOnly(file);
            }}
          />
        </label>
      </div>

      <div className={styles.addCard}>
        <h2>② 上传并直接入库</h2>
        <p className={styles.addHint}>
          接口 <code>POST /api/kb</code>，<code>action=upload</code> +{" "}
          <code>file</code>。解析成功同样返回 <code>preview</code>。
        </p>
        <label className={styles.uploadBtn}>
          {busy === "__upload__" ? "入库中…" : "选择文件上传入库"}
          <input
            ref={fileInputRef}
            className={styles.fileInput}
            type="file"
            accept=".md,.txt,.csv,.json"
            disabled={busy !== null}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadAndSave(file);
            }}
          />
        </label>
      </div>

      <div className={styles.addCard}>
        <h2>③ 手动新增</h2>
        <input
          className={styles.titleInput}
          value={title}
          placeholder="文档标题，如「售后服务规范」"
          onChange={(e) => setTitle(e.target.value)}
          maxLength={30}
        />
        <textarea
          className={styles.contentInput}
          value={content}
          placeholder="文档正文（Markdown），保存后立即参与检索"
          rows={6}
          onChange={(e) => setContent(e.target.value)}
        />
        <button
          className={styles.addBtn}
          onClick={submitAdd}
          disabled={busy !== null || !title.trim() || !content.trim()}
        >
          {busy === "__add__" ? "保存中…" : "保存并启用"}
        </button>
      </div>
    </div>
  );
}
