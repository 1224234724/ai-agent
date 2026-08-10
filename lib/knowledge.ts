// 企业知识库（轻量 RAG）：
// 加载 data/knowledge/ 下的 Markdown 文档，按段落切块，
// 用「中文二元组 + 英文词」的重叠度为查询打分，返回最相关的段落
// 检索结果由 /api/chat 注入系统提示词，实现检索增强回答
// 支持后台管理：通过 data/kb-config.json 控制各文档的启用状态

import { promises as fs } from "fs";
import path from "path";

export type KnowledgeChunk = {
  doc: string;
  title: string;
  content: string;
};

export type DocStatus = {
  file: string;
  title: string;
  chunks: number;
  enabled: boolean;
};

type KbConfig = { disabled: string[] };

const CONFIG_PATH = path.join(process.cwd(), "data", "kb-config.json");
const KNOWLEDGE_DIR = path.join(process.cwd(), "data", "knowledge");

// 已启用文档的切块缓存；任何管理操作后清空重建
let cache: KnowledgeChunk[] | null = null;

async function loadConfig(): Promise<KbConfig> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf-8");
    const cfg = JSON.parse(raw) as Partial<KbConfig>;
    return { disabled: Array.isArray(cfg.disabled) ? cfg.disabled : [] };
  } catch {
    return { disabled: [] };
  }
}

async function saveConfig(cfg: KbConfig): Promise<void> {
  await fs.writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf-8");
}

// 读取全部文档并切块（不看启用状态，供后台统计使用）
async function readAllDocs(): Promise<KnowledgeChunk[]> {
  const files = await fs.readdir(KNOWLEDGE_DIR);
  const chunks: KnowledgeChunk[] = [];
  for (const file of files.filter((f) => f.endsWith(".md"))) {
    const raw = await fs.readFile(path.join(KNOWLEDGE_DIR, file), "utf-8");
    const title = raw.match(/^#\s+(.+)$/m)?.[1] ?? file;
    // 按空行切段（兼容 CRLF 行尾），跳过标题行与代码围栏标记
    const parts = raw
      .split(/\r?\n\s*\r?\n/)
      .map((p) => p.trim())
      .filter((p) => p && !/^#/.test(p) && p !== "```");
    for (const content of parts) {
      chunks.push({ doc: file, title, content });
    }
  }
  return chunks;
}

// 已启用文档的切块（供检索与首页统计使用）
export async function loadChunks(): Promise<KnowledgeChunk[]> {
  if (cache) return cache;
  const cfg = await loadConfig();
  const disabled = new Set(cfg.disabled);
  const chunks = (await readAllDocs()).filter((c) => !disabled.has(c.doc));
  // 只在真正读到文档时才缓存
  if (chunks.length) cache = chunks;
  return chunks;
}

// 后台列表：每篇文档的标题、切块数与启用状态
export async function getDocStatuses(): Promise<DocStatus[]> {
  const cfg = await loadConfig();
  const disabled = new Set(cfg.disabled);
  const all = await readAllDocs();
  const byDoc = new Map<string, DocStatus>();
  for (const chunk of all) {
    const item = byDoc.get(chunk.doc) ?? {
      file: chunk.doc,
      title: chunk.title,
      chunks: 0,
      enabled: !disabled.has(chunk.doc),
    };
    item.chunks++;
    byDoc.set(chunk.doc, item);
  }
  return [...byDoc.values()];
}

// 启用 / 停用某篇文档（后台开关）
export async function setDocEnabled(
  file: string,
  enabled: boolean
): Promise<void> {
  const cfg = await loadConfig();
  const disabled = new Set(cfg.disabled);
  if (enabled) disabled.delete(file);
  else disabled.add(file);
  await saveConfig({ disabled: [...disabled] });
  cache = null;
}

// 新增知识库文档（后台表单），标题作为一级标题与文件名前缀
export async function addDocument(
  title: string,
  content: string
): Promise<{ file: string; preview: ParsePreview }> {
  const cleanTitle = title.trim().slice(0, 30);
  const body = content.trim();
  if (!cleanTitle || !body) {
    throw new Error("标题和正文都不能为空");
  }
  const file = await writeDocFile(cleanTitle, body);
  cache = null;
  return { file, preview: buildPreview(cleanTitle, body, file, "manual") };
}

export type ParsePreview = {
  title: string;
  content: string;
  previewText: string;
  charCount: number;
  chunkCount: number;
  chunks: string[];
  sourceType: string;
  file?: string;
};

export const UPLOAD_EXTENSIONS = [".md", ".txt", ".csv", ".json"];
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const PREVIEW_CHARS = 800;

function splitChunks(body: string): string[] {
  return body
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter((p) => p && !/^#/.test(p) && p !== "```");
}

function buildPreview(
  title: string,
  content: string,
  file: string | undefined,
  sourceType: string
): ParsePreview {
  const chunks = splitChunks(content);
  return {
    title,
    content,
    previewText:
      content.length > PREVIEW_CHARS
        ? `${content.slice(0, PREVIEW_CHARS)}…`
        : content,
    charCount: content.length,
    chunkCount: chunks.length || (content ? 1 : 0),
    chunks: chunks.slice(0, 5),
    sourceType,
    file,
  };
}

/** 仅解析、不入库：供 /api/kb/parse 预览 */
export async function parseUploadFile(
  filename: string,
  buffer: ArrayBuffer
): Promise<ParsePreview> {
  const { title, content, sourceType } = await extractFromUpload(
    filename,
    buffer
  );
  return buildPreview(title, content, undefined, sourceType);
}

/** 解析并入库，同时返回预览 */
export async function addDocumentFromFile(
  filename: string,
  buffer: ArrayBuffer
): Promise<{ file: string; preview: ParsePreview }> {
  const { title, content, sourceType } = await extractFromUpload(
    filename,
    buffer
  );
  const file = await writeDocFile(title.slice(0, 30), content);
  cache = null;
  return { file, preview: buildPreview(title, content, file, sourceType) };
}

async function extractFromUpload(
  filename: string,
  buffer: ArrayBuffer
): Promise<{ title: string; content: string; sourceType: string }> {
  if (buffer.byteLength === 0) throw new Error("文件为空");
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error("文件超过 2MB 限制");
  }
  const ext = path.extname(filename).toLowerCase();
  if (!UPLOAD_EXTENSIONS.includes(ext)) {
    throw new Error(`不支持的文件类型，仅支持 ${UPLOAD_EXTENSIONS.join(" / ")}`);
  }

  const text = Buffer.from(buffer).toString("utf-8");
  const base = filename.replace(/\.[^.]+$/, "");
  let title = base;
  let content = text.trim();
  let sourceType = ext.replace(".", "") || "text";

  if (ext === ".csv") {
    const lines = content.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) throw new Error("CSV 至少需要表头和一行数据");
    const cols = lines[0].split(",").map((c) => c.trim());
    content = lines
      .slice(1)
      .map((line) => {
        const vals = line.split(",");
        return cols
          .map((c, i) => `${c}: ${(vals[i] ?? "").trim()}`)
          .join(" | ");
      })
      .join("\n\n");
    sourceType = "csv";
  } else if (ext === ".json") {
    try {
      content = JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      throw new Error("JSON 文件解析失败，请检查格式");
    }
    sourceType = "json";
  } else {
    const heading = content.match(/^#\s+(.+)$/m)?.[1];
    if (heading) {
      title = heading.trim();
      content = content.replace(/^#\s+.+$/m, "").trim();
    }
    sourceType = ext === ".md" ? "markdown" : "text";
  }

  if (!content) throw new Error("文件解析后内容为空");
  return { title: title.slice(0, 30) || base.slice(0, 30), content, sourceType };
}

/** 读取已入库文档详情（预览） */
export async function getDocumentDetail(file: string): Promise<ParsePreview> {
  if (!file.endsWith(".md") || file.includes("/") || file.includes("\\")) {
    throw new Error("非法文件名");
  }
  const raw = await fs.readFile(path.join(KNOWLEDGE_DIR, file), "utf-8");
  const title = raw.match(/^#\s+(.+)$/m)?.[1] ?? file;
  const content = raw.replace(/^#\s+.+$/m, "").trim();
  return buildPreview(title, content, file, "stored");
}

// 删除知识库文档（后台操作）
export async function removeDocument(file: string): Promise<void> {
  // 只允许删除知识库目录内的 .md 文件，防止路径穿越
  if (!file.endsWith(".md") || file.includes("/") || file.includes("\\")) {
    throw new Error("非法文件名");
  }
  await fs.unlink(path.join(KNOWLEDGE_DIR, file));
  // 同步清理启用配置中的记录
  const cfg = await loadConfig();
  if (cfg.disabled.includes(file)) {
    await saveConfig({ disabled: cfg.disabled.filter((f) => f !== file) });
  }
  cache = null;
}

// 统一写入：标题作为一级标题，文件名加时间戳防重名
async function writeDocFile(title: string, body: string): Promise<string> {
  const safeName = title.replace(/[\\/:*?"<>|\s]+/g, "-");
  const file = `${safeName}-${Date.now()}.md`;
  await fs.writeFile(
    path.join(KNOWLEDGE_DIR, file),
    `# ${title}\n\n${body}\n`,
    "utf-8"
  );
  return file;
}

// 分词：英文/数字按词，中文按相邻二字组合（二元组）
function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const word of text.toLowerCase().match(/[a-z0-9_]+/g) ?? []) {
    tokens.add(word);
  }
  for (const run of text.match(/[\u4e00-\u9fa5]+/g) ?? []) {
    if (run.length === 1) {
      tokens.add(run);
      continue;
    }
    for (let i = 0; i + 2 <= run.length; i++) {
      tokens.add(run.slice(i, i + 2));
    }
  }
  return tokens;
}

// 检索与查询最相关的段落；得分 = 查询词命中率，低于阈值视为不相关
export async function retrieve(
  query: string,
  topK = 3,
  minScore = 0.15
): Promise<KnowledgeChunk[]> {
  const chunks = await loadChunks();
  const queryTokens = tokenize(query);
  if (!queryTokens.size) return [];

  const scored = chunks
    .map((chunk) => {
      const chunkTokens = tokenize(chunk.content);
      let hit = 0;
      for (const token of queryTokens) {
        if (chunkTokens.has(token)) hit++;
      }
      return { chunk, score: hit / queryTokens.size };
    })
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, topK).map((item) => item.chunk);
}
