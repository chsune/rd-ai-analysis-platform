# 研发项目AI分析平台 MVP

一个用于验证宜搭 Excel 上传、研发项目状态统计和 DeepSeek 项目分析的 MVP。

## 功能

- 管理员登录
- 研发项目 OA 分析
- 工时系统分析
- 上传“项目立项”Excel
- 上传“标定清单”Excel
- 配置 DeepSeek API Key、Base URL 和模型名
- 无 API Key 时自动启用 Mock AI 分析

## 本地运行

```bash
npm install
npm run dev
```

默认账号：

```text
admin / Admin@2026
```

## Vercel 部署

Vercel 会读取 `vercel.json`，使用：

```bash
next build
```

如需真实调用 DeepSeek，在 Vercel Project 的 Environment Variables 中配置：

```text
DEEPSEEK_API_KEY=你的Key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=dsv4pro
```

也可以登录后在“数据与AI设置”页面填写 DeepSeek 接口参数。
