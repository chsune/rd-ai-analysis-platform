import { pick } from "./excel";
import type { ProjectRecord, ProjectView, RiskLevel, StoreShape, TaskRecord } from "./types";

const defaultPrompt = "请基于研发项目OA统计、风险项目和不通过任务，输出三部分：1. 当前总体情况 2. 重点风险项目 3. 建议采取的动作。要求简洁、面向管理层、只依据输入数据。";
const defaultWorkhourPrompt = "请基于研发项目统计结果，从工时管理视角输出三部分：1. 当前总体情况 2. 重点风险项目 3. 建议采取的动作。重点关注待提交、待评审、不通过任务可能带来的工时返工和资源占用风险。";

export function emptyStore(): StoreShape {
  return {
    projects: [],
    tasks: [],
    projectUploadAt: "",
    taskUploadAt: "",
    prompt: defaultPrompt,
    analysis: "",
    analysisAt: "",
    workhourPrompt: defaultWorkhourPrompt,
    workhourAnalysis: "",
    workhourAnalysisAt: "",
    deepseekApiKey: "",
    deepseekBaseUrl: "https://api.deepseek.com",
    deepseekModel: "deepseek-chat"
  };
}

function parseDateValue(value: string) {
  if (!value) return "";
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  const m = value.match(/(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return value;
}

function latestTime(value: string) {
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export function normalizeProjects(rows: Record<string, string>[]): ProjectRecord[] {
  const records = rows.flatMap((row) => {
    const projectNo = pick(row, ["项目编号", "项目编码", "项目号"]);
    const projectName = pick(row, ["项目名称", "项目名"]);
    if (!projectNo && !projectName) return [];
    return [{
      instanceId: pick(row, ["实例ID", "实例 Id", "流程实例ID", "流程实例 Id", "ID"]) || `${projectNo}-${row.__row}`,
      projectNo,
      projectName,
      productSeries: pick(row, ["产品系列", "产品线", "系列"]),
      manager: pick(row, ["项目经理", "负责人", "PM"]),
      sopDate: parseDateValue(pick(row, ["SOP节点", "SOP日期", "SOP时间", "SOP"])),
      status: pick(row, ["项目状态", "流程状态", "状态"]) || "未知",
      approvalStatus: pick(row, ["审批状态", "评审状态", "流程结果"]) || "未知",
      modifiedAt: pick(row, ["修改时间", "更新时间", "提交时间", "发起时间", "创建时间"]),
      sourceRow: Number(row.__row || 0)
    }];
  });

  const groups = new Map<string, ProjectRecord[]>();
  for (const record of records) {
    const key = record.projectNo || record.instanceId;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  return [...groups.values()].map((items) => {
    const running = items.filter((item) => item.status.includes("运行中"));
    const pool = running.length ? running : items;
    return pool.sort((a, b) => latestTime(b.modifiedAt) - latestTime(a.modifiedAt))[0];
  });
}

export function normalizeTasks(rows: Record<string, string>[]): TaskRecord[] {
  return rows.flatMap((row) => {
    const projectNo = pick(row, ["项目编号", "项目编码", "项目号"]);
    const taskName = pick(row, ["任务名称", "任务名", "标定项", "评审项", "清单名称"]);
    if (!projectNo && !taskName) return [];
    const review = pick(row, ["评审状态", "审批状态", "评审结果", "结论"]);
    return [{
      projectNo,
      taskName: taskName || "未命名任务",
      taskStatus: pick(row, ["任务状态", "状态", "当前状态"]) || review || "未知",
      reviewStatus: review || "未知",
      owner: pick(row, ["负责人", "责任人", "提交人", "处理人"]),
      modifiedAt: pick(row, ["修改时间", "更新时间", "提交时间", "创建时间"]),
      sourceRow: Number(row.__row || 0)
    }];
  });
}

function taskBucket(task: TaskRecord) {
  const text = `${task.taskStatus} ${task.reviewStatus}`;
  if (text.includes("不通过") || text.includes("驳回")) return "评审不通过";
  if (text.includes("待提交")) return "待提交";
  if (text.includes("待评审") || text.includes("审核中") || text.includes("审批中")) return "待评审";
  if (text.includes("通过") || text.includes("完成")) return "已通过/完成";
  return task.taskStatus || "未知";
}

export function buildProjectViews(projects: ProjectRecord[], tasks: TaskRecord[], now = new Date()): ProjectView[] {
  return projects.map((project) => {
    const projectTasks = tasks.filter((task) => task.projectNo && task.projectNo === project.projectNo);
    const failedTasks = projectTasks.filter((task) => taskBucket(task) === "评审不通过");
    const hasPendingReview = projectTasks.some((task) => taskBucket(task) === "待评审");
    const taskCounts = projectTasks.reduce<Record<string, number>>((acc, task) => {
      const bucket = taskBucket(task);
      acc[bucket] = (acc[bucket] ?? 0) + 1;
      return acc;
    }, {});
    const reasons: string[] = [];
    const sop = project.sopDate ? new Date(project.sopDate) : null;
    if (sop && !Number.isNaN(sop.getTime()) && sop.getTime() < new Date(now.toDateString()).getTime()) reasons.push("SOP已逾期");
    if (failedTasks.length) reasons.push("存在评审不通过任务");
    let riskLevel: RiskLevel = reasons.length ? "红色" : "绿色";
    if (riskLevel === "绿色" && hasPendingReview) {
      riskLevel = "黄色";
      reasons.push("存在待评审任务");
    }
    if (riskLevel === "绿色" && !project.sopDate) {
      riskLevel = "黄色";
      reasons.push("SOP日期为空");
    }
    return { ...project, riskLevel, riskReasons: reasons, taskCounts, failedTasks };
  });
}

export function getStats(store: StoreShape) {
  const views = buildProjectViews(store.projects, store.tasks);
  const statusDistribution = views.reduce<Record<string, number>>((acc, p) => {
    acc[p.status || "未知"] = (acc[p.status || "未知"] ?? 0) + 1;
    return acc;
  }, {});
  const taskDistribution = store.tasks.reduce<Record<string, number>>((acc, t) => {
    const bucket = taskBucket(t);
    acc[bucket] = (acc[bucket] ?? 0) + 1;
    return acc;
  }, {});
  return {
    projectCount: views.length,
    runningProjectCount: views.filter((p) => p.status.includes("运行中")).length,
    pendingSubmitTaskCount: store.tasks.filter((t) => taskBucket(t) === "待提交").length,
    riskProjectCount: views.filter((p) => p.riskLevel !== "绿色").length,
    statusDistribution,
    taskDistribution,
    projects: views
  };
}

export function aiPayload(store: StoreShape) {
  const stats = getStats(store);
  return {
    metrics: {
      projectCount: stats.projectCount,
      runningProjectCount: stats.runningProjectCount,
      pendingSubmitTaskCount: stats.pendingSubmitTaskCount,
      riskProjectCount: stats.riskProjectCount,
      statusDistribution: stats.statusDistribution,
      taskDistribution: stats.taskDistribution
    },
    riskProjects: stats.projects
      .filter((p) => p.riskLevel !== "绿色")
      .map((p) => ({ projectNo: p.projectNo, projectName: p.projectName, riskLevel: p.riskLevel, reasons: p.riskReasons, sopDate: p.sopDate })),
    failedTasks: stats.projects.flatMap((p) => p.failedTasks.map((t) => ({ projectNo: p.projectNo, projectName: p.projectName, taskName: t.taskName, status: t.taskStatus, reviewStatus: t.reviewStatus })))
  };
}
