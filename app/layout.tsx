import type { Metadata } from "next";
import { Outfit, Noto_Sans_SC } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  fallback: ["PingFang SC", "Microsoft YaHei", "sans-serif"],
});

const notoSansSc = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
  fallback: ["PingFang SC", "Microsoft YaHei", "sans-serif"],
});

export const metadata: Metadata = {
  title: "ai-agent · 企业级 AI Agent 平台",
  description:
    "知识库检索增强 + 工具调用 + 多人设 Agent，Next.js 服务端渲染与流式对话",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className={`${outfit.variable} ${notoSansSc.variable}`}>
      <body>{children}</body>
    </html>
  );
}
