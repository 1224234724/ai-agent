// Agent 工具库：定义并执行可调用的外部工具（OpenAI function calling 格式）
// - get_weather：调用 Open-Meteo 外部 API 查询实时天气（无需密钥）
// - get_current_time：获取服务器当前时间
// - get_server_status：查询服务器运行状态

import os from "os";

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type AccumulatedToolCall = {
  id: string;
  name: string;
  arguments: string;
};

// 天气代码 → 中文描述（Open-Meteo WMO 编码）
const WEATHER_CODE_DESC: Record<number, string> = {
  0: "晴",
  1: "大部晴朗",
  2: "多云",
  3: "阴",
  45: "雾",
  48: "冻雾",
  51: "小毛毛雨",
  53: "毛毛雨",
  55: "大毛毛雨",
  61: "小雨",
  63: "中雨",
  65: "大雨",
  71: "小雪",
  73: "中雪",
  75: "大雪",
  80: "阵雨",
  81: "强阵雨",
  82: "暴雨",
  95: "雷阵雨",
  96: "雷阵雨伴冰雹",
  99: "强雷暴",
};

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description:
        "查询指定城市的实时天气（温度、体感温度、天气状况、风速）。用户询问天气时调用。",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "城市名称，如「北京」「上海」" },
        },
        required: ["city"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_current_time",
      description: "获取服务器当前日期和时间。用户询问现在几点、今天日期时调用。",
      parameters: {
        type: "object",
        properties: {
          timezone: {
            type: "string",
            description: "IANA 时区名，如 Asia/Shanghai，默认 Asia/Shanghai",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_server_status",
      description:
        "查询当前服务器运行状态（Node.js 版本、内存占用、运行时长）。用户询问系统/服务器状态时调用。",
      parameters: { type: "object", properties: {} },
    },
  },
];

// 执行工具并返回 JSON 字符串结果（始终成功返回，错误也序列化为结果）
export async function executeTool(
  name: string,
  argsJson: string
): Promise<string> {
  let args: Record<string, unknown> = {};
  try {
    if (argsJson) args = JSON.parse(argsJson);
  } catch {
    return JSON.stringify({ error: `工具参数解析失败: ${argsJson}` });
  }

  try {
    switch (name) {
      case "get_weather":
        return await getWeather(String(args.city ?? ""));
      case "get_current_time":
        return getCurrentTime(String(args.timezone ?? "Asia/Shanghai"));
      case "get_server_status":
        return getServerStatus();
      default:
        return JSON.stringify({ error: `未知工具: ${name}` });
    }
  } catch (err) {
    return JSON.stringify({ error: `工具执行失败: ${(err as Error).message}` });
  }
}

// 调用外部 Open-Meteo API：先地理编码，再查实时天气
async function getWeather(city: string): Promise<string> {
  if (!city) return JSON.stringify({ error: "缺少 city 参数" });

  const geoRes = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh`
  );
  const geo = await geoRes.json();
  const loc = geo?.results?.[0];
  if (!loc) {
    return JSON.stringify({ error: `未找到城市「${city}」` });
  }

  const wxRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}` +
      `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`
  );
  const wx = await wxRes.json();
  const current = wx?.current;
  if (!current) {
    return JSON.stringify({ error: "天气服务暂时不可用" });
  }

  return JSON.stringify({
    city: loc.name,
    temperature: `${current.temperature_2m}°C`,
    apparentTemperature: `${current.apparent_temperature}°C`,
    weather: WEATHER_CODE_DESC[current.weather_code] ?? `代码${current.weather_code}`,
    windSpeed: `${current.wind_speed_10m} km/h`,
    observedAt: current.time,
  });
}

function getCurrentTime(timezone: string): string {
  const now = new Date();
  let text: string;
  try {
    text = now.toLocaleString("zh-CN", {
      timeZone: timezone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "long",
    });
  } catch {
    text = now.toLocaleString("zh-CN", { hour12: false });
  }
  return JSON.stringify({ timezone, now: text });
}

function getServerStatus(): string {
  const mem = process.memoryUsage();
  return JSON.stringify({
    nodeVersion: process.version,
    platform: `${os.type()} ${os.release()} (${os.arch()})`,
    cpuCores: os.cpus().length,
    memoryUsageMB: Math.round(mem.heapUsed / 1024 / 1024),
    uptimeSeconds: Math.round(process.uptime()),
  });
}
