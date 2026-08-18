import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "研发项目AI分析平台",
  description: "研发项目 AI 分析平台 MVP"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
