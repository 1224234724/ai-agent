// 聊天接口：服务端运行，支持两种模式
// 1. 配置了 OPENAI_API_KEY：以流式调用 OpenAI 兼容接口（可用 OPENAI_BASE_URL 指向本地模型）
// 2. 未配置：本地 mock 智能体，模拟流式输出，方便无 Key 直接体验
// 支持账号绑定 Agent + 企业知识库检索增强（RAG）

import { retrieve } from "@/lib/knowledge";
import {
  TOOL_DEFINITIONS,
  executeTool,
  type AccumulatedToolCall,
} from "@/lib/tools";
import { appendAudit } from "@/lib/audit";
import { checkRateLimit, clientKey } from "@/lib/rate-limit";
import {
  PERSONAS,
  resolvePersona,
  type PersonaKey,
} from "@/lib/personas";
import {
  AuthError,
  authErrorResponse,
  getSessionFromRequest,
} from "@/lib/auth";

export const runtime = "nodejs";

// 对话消息（包含工具调用相关的宽松字段）
type ChatMessage = {
  role: "user" | "assistant" | "system" | "tool";
  content: string | null;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
};

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const BASE_URL = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";

export async function POST(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) throw new AuthError("未登录", 401);

    if (!checkRateLimit(clientKey(req))) {
      return Response.json(
        { error: "请求过于频繁，请稍后再试" },
        { status: 429 }
      );
    }

    const { messages } = (await req.json()) as {
      messages: ChatMessage[];
      persona?: string;
    };
    // 账号绑定固定 Agent，忽略客户端传入的 persona
    const key: PersonaKey = resolvePersona(session.persona);

    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const refs = lastUser ? await retrieve(lastUser.content ?? "") : [];
    const knowledge = refs.length
      ? "\n\n【企业知识库参考资料】\n" +
        refs
          .map((r, i) => `${i + 1}. （来源：${r.title}）${r.content}`)
          .join("\n") +
        "\n回答要求：若用户问题与上述参考资料相关，优先依据资料作答并保持与事实一致；无关则正常回答。"
      : "";

    const audit = {
      startedAt: Date.now(),
      persona: PERSONAS[key].name,
      kbHits: refs.length,
      toolCalls: [] as string[],
      user: session.username,
    };

    if (process.env.OPENAI_API_KEY) {
      return streamFromLLM(messages, PERSONAS[key], knowledge, audit);
    }
    return streamFromMock(messages, PERSONAS[key], refs, audit);
  } catch (err) {
    return authErrorResponse(err);
  }
}

// 流式结束后写一条审计记录（失败不影响主流程）
function finishAudit(
  audit: {
    startedAt: number;
    persona: string;
    kbHits: number;
    toolCalls: string[];
    user?: string;
  },
  ok: boolean
) {
  void appendAudit({
    time: new Date().toISOString(),
    persona: audit.persona,
    model: MODEL,
    kbHits: audit.kbHits,
    toolCalls: audit.toolCalls,
    durationMs: Date.now() - audit.startedAt,
    ok,
    user: audit.user,
  });
}

type AuditCtx = Parameters<typeof finishAudit>[0];

// 调用真实大模型（流式 + 工具调用循环）：
// 模型返回 tool_calls 时先执行工具、把结果回填对话，再发起下一轮流式请求；
// 最终回答的文本流实时转发给前端，工具调用过程以「🔧」提示行展示
async function streamFromLLM(
  messages: ChatMessage[],
  persona: (typeof PERSONAS)[PersonaKey],
  knowledge: string,
  audit: AuditCtx
) {
  const MAX_TOOL_ROUNDS = 4;
  const convo: ChatMessage[] = [
    { role: "system", content: persona.prompt + knowledge },
    ...messages,
  ];
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
          const upstream = await fetch(`${BASE_URL}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
              model: MODEL,
              stream: true,
              messages: convo,
              tools: TOOL_DEFINITIONS,
            }),
          });

          if (!upstream.ok || !upstream.body) {
            controller.enqueue(encoder.encode(`大模型请求失败: ${upstream.status}`));
            controller.close();
            return;
          }

          // 边读边解析 SSE：文本增量直接转发，tool_calls 增量按 index 累积
          const reader = upstream.body.getReader();
          let buffer = "";
          let content = "";
          let sawToolCall = false;
          const toolCalls = new Map<number, AccumulatedToolCall>();

          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              const text = line.trim();
              if (!text.startsWith("data:")) continue;
              const data = text.slice(5).trim();
              if (data === "[DONE]") continue;
              try {
                const delta = JSON.parse(data).choices?.[0]?.delta;
                if (delta?.content) {
                  content += delta.content;
                  controller.enqueue(encoder.encode(delta.content));
                }
                for (const tc of delta?.tool_calls ?? []) {
                  sawToolCall = true;
                  const acc = toolCalls.get(tc.index) ?? {
                    id: "",
                    name: "",
                    arguments: "",
                  };
                  if (tc.id) acc.id = tc.id;
                  acc.name += tc.function?.name ?? "";
                  acc.arguments += tc.function?.arguments ?? "";
                  toolCalls.set(tc.index ?? 0, acc);
                }
              } catch {
                // 忽略无法解析的行
              }
            }
          }

          // 本轮没有工具调用：最终回答已流式输出完毕
          if (!sawToolCall) {
            finishAudit(audit, true);
            controller.close();
            return;
          }

          // 回填助手工具调用消息，逐个执行工具并追加结果
          convo.push({
            role: "assistant",
            content: content || null,
            tool_calls: [...toolCalls.values()].map((tc) => ({
              id: tc.id,
              type: "function",
              function: { name: tc.name, arguments: tc.arguments },
            })),
          });
          for (const tc of toolCalls.values()) {
            controller.enqueue(
              encoder.encode(`\n[工具调用 ${tc.name}(${tc.arguments})]\n`)
            );
            const result = await executeTool(tc.name, tc.arguments);
            audit.toolCalls.push(tc.name);
            convo.push({ role: "tool", tool_call_id: tc.id, content: result });
          }
        }
        finishAudit(audit, true);
        controller.close();
      } catch (err) {
        finishAudit(audit, false);
        controller.enqueue(encoder.encode(`\n处理出错：${(err as Error).message}`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

// 无 Key 时的本地模拟：逐小块输出，演示流式效果
function streamFromMock(
  messages: ChatMessage[],
  persona: (typeof PERSONAS)[PersonaKey],
  refs: Awaited<ReturnType<typeof retrieve>>,
  audit: AuditCtx
) {
  const last = messages[messages.length - 1]?.content ?? "";
  const kbHits = refs.length
    ? `\n\n知识库命中：${refs.map((r) => `《${r.title}》`).join("、")}`
    : "";
  const reply =
    `[${persona.name}·Mock] ${persona.mockTone}\n\n` +
    `你的消息：「${last}」${kbHits}\n\n` +
    `当前未配置 OPENAI_API_KEY，这是本地模拟的流式回复。` +
    `在项目根目录创建 .env.local 并填入 OPENAI_API_KEY 即可接入真实大模型，` +
    `还可以通过 OPENAI_BASE_URL 指向任意 OpenAI 兼容接口（如本地部署的模型）。`;

  const encoder = new TextEncoder();
  const chunks = reply.match(/[\s\S]{1,3}/g) ?? [reply];

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      finishAudit(audit, true);
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
