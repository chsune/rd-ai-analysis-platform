import { NextResponse } from "next/server";
import { getStats } from "@/lib/normalize";
import { readStore } from "@/lib/store";

export async function GET() {
  const store = await readStore();
  return NextResponse.json({
    ...getStats(store),
    projectUploadAt: store.projectUploadAt,
    taskUploadAt: store.taskUploadAt,
    projectRows: store.projects.length,
    taskRows: store.tasks.length,
    prompt: store.prompt,
    analysis: store.analysis,
    analysisAt: store.analysisAt,
    workhourPrompt: store.workhourPrompt,
    workhourAnalysis: store.workhourAnalysis,
    workhourAnalysisAt: store.workhourAnalysisAt,
    deepseekBaseUrl: store.deepseekBaseUrl,
    deepseekModel: store.deepseekModel,
    hasDeepseekApiKey: Boolean(store.deepseekApiKey || process.env.DEEPSEEK_API_KEY)
  });
}
