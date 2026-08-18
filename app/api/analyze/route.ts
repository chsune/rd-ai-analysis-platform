import { NextResponse } from "next/server";
import { aiPayload } from "@/lib/normalize";
import { readStore, writeStore } from "@/lib/store";

type AnalyzeType = "oa" | "workhours";

function mockAnalysis(payload: ReturnType<typeof aiPayload>, type: AnalyzeType) {
  const red = payload.riskProjects.filter((p) => p.riskLevel === "红色").slice(0, 5);
  const angle = type === "workhours" ? "工时资源" : "研发项目OA";
  return [
    "1. 当前总体情况",
    `${angle}分析：当前共 ${payload.metrics.projectCount} 个项目，运行中 ${payload.metrics.runningProjectCount} 个，待提交任务 ${payload.metrics.pendingSubmitTaskCount} 个，风险项目 ${payload.metrics.riskProjectCount} 个。`,
    "",
    "2. 重点风险项目",
    red.length
      ? red.map((p) => `- ${p.projectNo || "无编号"} ${p.projectName || "未命名项目"}：${p.reasons.join("、")}`).join("\n")
      : "- 当前没有红色风险项目，建议继续关注黄色风险项目的 SOP 日期和待评审任务。",
    "",
    "3. 建议采取的动作",
    type === "workhours"
      ? "- 优先核查红色风险项目的返工工时占用。\n- 对待提交和待评审任务建立工时预警。\n- 将不通过任务纳入本周资源协调清单。"
      : "- 优先跟进 SOP 已逾期或评审不通过的项目，明确责任人与关闭日期。\n- 对待提交任务建立短周期催办节奏。\n- 补齐 SOP 为空的项目基础信息，避免后续风险误判。"
  ].join("\n");
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const type: AnalyzeType = body.type === "workhours" ? "workhours" : "oa";
  const store = await readStore();
  const payload = aiPayload(store);
  const apiKey = store.deepseekApiKey || process.env.DEEPSEEK_API_KEY;
  const prompt = type === "workhours" ? store.workhourPrompt : store.prompt;
  let analysis = "";

  if (!apiKey) {
    analysis = mockAnalysis(payload, type);
  } else {
    const baseUrl = store.deepseekBaseUrl || process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
    const model = store.deepseekModel || process.env.DEEPSEEK_MODEL || "deepseek-chat";
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "你是研发项目管理分析助手。输出必须包含并突出三部分标题：1. 当前总体情况 2. 重点风险项目 3. 建议采取的动作。" },
          { role: "user", content: `${prompt}\n\n以下是代码计算后的统计数据，不包含原始Excel全文：\n${JSON.stringify(payload, null, 2)}` }
        ],
        temperature: 0.2
      })
    });
    if (!response.ok) {
      analysis = `1. 当前总体情况\nDeepSeek 调用失败，已保留代码统计结果。当前风险项目数量：${payload.metrics.riskProjectCount}。\n\n2. 重点风险项目\n请检查 DeepSeek API Key、Base URL 和模型名是否正确。\n\n3. 建议采取的动作\n在“数据与AI设置”中填写可用的 DeepSeek API Key、Base URL 和模型名后重新生成。`;
    } else {
      const data = await response.json();
      analysis = data.choices?.[0]?.message?.content || mockAnalysis(payload, type);
    }
  }

  if (type === "workhours") {
    store.workhourAnalysis = analysis;
    store.workhourAnalysisAt = new Date().toISOString();
  } else {
    store.analysis = analysis;
    store.analysisAt = new Date().toISOString();
  }
  await writeStore(store);
  return NextResponse.json({
    ok: true,
    analysis,
    analysisAt: type === "workhours" ? store.workhourAnalysisAt : store.analysisAt,
    mock: !apiKey,
    type
  });
}
