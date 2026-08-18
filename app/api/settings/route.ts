import { NextResponse } from "next/server";
import { readStore, writeStore } from "@/lib/store";

export async function POST(request: Request) {
  const body = await request.json();
  const store = await readStore();
  if (typeof body.prompt === "string") store.prompt = body.prompt.trim() || store.prompt;
  if (typeof body.workhourPrompt === "string") store.workhourPrompt = body.workhourPrompt.trim() || store.workhourPrompt;
  if (typeof body.deepseekBaseUrl === "string") store.deepseekBaseUrl = body.deepseekBaseUrl.trim() || "https://api.deepseek.com";
  if (typeof body.deepseekModel === "string") store.deepseekModel = body.deepseekModel.trim() || "deepseek-chat";
  if (typeof body.deepseekApiKey === "string" && body.deepseekApiKey.trim()) store.deepseekApiKey = body.deepseekApiKey.trim();
  await writeStore(store);
  return NextResponse.json({
    ok: true,
    prompt: store.prompt,
    workhourPrompt: store.workhourPrompt,
    deepseekBaseUrl: store.deepseekBaseUrl,
    deepseekModel: store.deepseekModel,
    hasDeepseekApiKey: Boolean(store.deepseekApiKey || process.env.DEEPSEEK_API_KEY)
  });
}
