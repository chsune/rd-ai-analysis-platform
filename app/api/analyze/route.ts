import { NextResponse } from "next/server";
import { aiPayload, workhourAiPayload } from "@/lib/normalize";
import { readStore, writeStore } from "@/lib/store";

type AnalyzeType = "oa" | "workhours";

function mockAnalysis(payload: ReturnType<typeof aiPayload>, type: AnalyzeType) {
  const red = payload.riskProjects.filter((p) => p.riskLevel === "红色").slice(0, 5);
  const angle = type === "workhours" ? "工时资源" : "研发项目OA";
  return ["1. 当前总体情况", `${angle}分析：当前共 ${payload.metrics.projectCount} 个项目，运行中 ${payload.metrics.runningProjectCount} 个，待提交任务 ${payload.metrics.pendingSubmitTaskCount} 个，风险项目 ${payload.metrics.riskProjectCount} 个。`, "", "2. 重点风险项目", red.length ? red.map((p) => `- ${p.projectNo || "无编号"} ${p.projectName || "未命名项目"}：${p.reasons.join("、")}`).join("\n") : "- 当前没有红色风险项目，建议继续关注黄色风险项目的 SOP 日期和待评审任务。", "", "3. 建议采取的动作", "- 优先跟进 SOP 已逾期或评审不通过的项目，明确责任人与关闭日期。\n- 对待提交任务建立短周期催办节奏。\n- 补齐 SOP 为空的项目基础信息，避免后续风险误判。"].join("\n");
}

function mockWorkhourAnalysis(payload: ReturnType<typeof workhourAiPayload>) {
  const taskTypes = payload.focusTaskTypeShare.length ? payload.focusTaskTypeShare : payload.taskTypeShare.slice(0, 5);
  const risky = payload.highInputLowOutput.slice(0, 5);
  return [
    "1. 当前总体情况",
    `当前已读取 ${payload.workhourMetrics.rowCount} 条工时记录，累计 ${payload.workhourMetrics.totalHours} 小时，涉及 ${payload.workhourMetrics.peopleCount} 人、${payload.workhourMetrics.projectCount} 个项目。重点任务类型工时占比：${taskTypes.map((item) => `${item.name}${item.share}%`).join("，") || "暂无数据"}。`,
    "",
    "2. 重点风险项目",
    risky.length ? risky.map((p) => `- ${p.projectName || p.projectNo}：投入 ${p.hours}h，参与 ${p.people} 人，产出记录 ${p.outputCount} 条，风险/问题记录 ${p.riskCount} 条，存在投入偏高但成果或闭环不足的迹象。`).join("\n") : "- 暂未识别到投入较大但成果较少的项目。",
    "",
    "3. 建议采取的动作",
    "- 对项目管理、软件开发、标定匹配三类任务建立周度工时占比监控。\n- 对高投入低产出项目补充阶段成果、交付物和问题闭环状态。\n- 将未立项或项目编号异常的工时单独清理，避免投入流向不可追溯。"
  ].join("\n");
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const type: AnalyzeType = body.type === "workhours" ? "workhours" : "oa";
  const store = await readStore();
  const payload = type === "workhours" ? workhourAiPayload(store) : aiPayload(store);
  const apiKey = store.deepseekApiKey || process.env.DEEPSEEK_API_KEY;
  const prompt = type === "workhours" ? store.workhourPrompt : store.prompt;
  let analysis = "";

  if (!apiKey) {
    analysis = type === "workhours" ? mockWorkhourAnalysis(payload as ReturnType<typeof workhourAiPayload>) : mockAnalysis(payload as ReturnType<typeof aiPayload>, type);
  } else {
    const baseUrl = store.deepseekBaseUrl || process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
    const model = store.deepseekModel || process.env.DEEPSEEK_MODEL || "deepseek-chat";
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "你是研发项目和工时管理分析助手。输出必须包含并突出三部分标题：1. 当前总体情况 2. 重点风险项目 3. 建议采取的动作。" },
          { role: "user", content: `${prompt}\n\n以下是代码计算后的统计数据，不包含原始Excel全文：\n${JSON.stringify(payload, null, 2)}` }
        ],
        temperature: 0.2
      })
    });
    if (!response.ok) {
      analysis = "1. 当前总体情况\nDeepSeek 调用失败，已保留代码统计结果。\n\n2. 重点风险项目\n请检查 DeepSeek API Key、Base URL 和模型名是否正确。\n\n3. 建议采取的动作\n在“数据与AI设置”中填写可用的 DeepSeek API Key、Base URL 和模型名后重新生成。";
    } else {
      const data = await response.json();
      analysis = data.choices?.[0]?.message?.content || (type === "workhours" ? mockWorkhourAnalysis(payload as ReturnType<typeof workhourAiPayload>) : mockAnalysis(payload as ReturnType<typeof aiPayload>, type));
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
  return NextResponse.json({ ok: true, analysis, analysisAt: type === "workhours" ? store.workhourAnalysisAt : store.analysisAt, mock: !apiKey, type });
}
