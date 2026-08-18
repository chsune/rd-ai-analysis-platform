import { pick } from "./excel";
import type { ProjectRecord, ProjectView, RiskLevel, StoreShape, TaskRecord, WorkhourRecord } from "./types";

const defaultPrompt = "请基于研发项目OA统计、风险项目和不通过任务，输出三部分：1. 当前总体情况 2. 重点风险项目 3. 建议采取的动作。要求简洁、面向管理层、只依据输入数据。";
const defaultWorkhourPrompt = "请按照《研发部门项目工时数据分析报告》的管理层分析口径，基于代码计算后的工时统计输出三部分：1. 当前总体情况 2. 重点风险项目 3. 建议采取的动作。必须覆盖：按岗位、部门和项目分析项目管理、软件开发、标定匹配等任务类型的工时占比；分析项目投入产出；关联项目工时投入、阶段成果、风险和进展，识别投入较大但成果较少的项目。不要编造原始数据之外的信息。";

export function emptyStore(): StoreShape {
  return { projects: [], tasks: [], workhours: [], projectUploadAt: "", taskUploadAt: "", workhourUploadAt: "", prompt: defaultPrompt, analysis: "", analysisAt: "", workhourPrompt: defaultWorkhourPrompt, workhourAnalysis: "", workhourAnalysisAt: "", deepseekApiKey: "", deepseekBaseUrl: "https://api.deepseek.com", deepseekModel: "deepseek-chat" };
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
    return [{ instanceId: pick(row, ["实例ID", "实例 Id", "流程实例ID", "流程实例 Id", "ID"]) || `${projectNo}-${row.__row}`, projectNo, projectName, productSeries: pick(row, ["产品系列", "产品线", "系列"]), manager: pick(row, ["项目经理", "负责人", "PM"]), sopDate: parseDateValue(pick(row, ["SOP节点", "SOP日期", "SOP时间", "SOP"])), status: pick(row, ["项目状态", "流程状态", "状态"]) || "未知", approvalStatus: pick(row, ["审批状态", "评审状态", "流程结果"]) || "未知", modifiedAt: pick(row, ["修改时间", "更新时间", "提交时间", "发起时间", "创建时间"]), sourceRow: Number(row.__row || 0) }];
  });
  const groups = new Map<string, ProjectRecord[]>();
  for (const record of records) groups.set(record.projectNo || record.instanceId, [...(groups.get(record.projectNo || record.instanceId) ?? []), record]);
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
    return [{ projectNo, taskName: taskName || "未命名任务", taskStatus: pick(row, ["任务状态", "状态", "当前状态"]) || review || "未知", reviewStatus: review || "未知", owner: pick(row, ["负责人", "责任人", "提交人", "处理人"]), modifiedAt: pick(row, ["修改时间", "更新时间", "提交时间", "创建时间"]), sourceRow: Number(row.__row || 0) }];
  });
}

function numberValue(value: string) {
  const n = Number(String(value || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function normalizeWorkhours(rows: Record<string, string>[]): WorkhourRecord[] {
  return rows.flatMap((row) => {
    const projectNo = pick(row, ["项目编号", "项目编码", "项目号"]);
    const projectName = pick(row, ["项目名称（文本）", "项目名称-yc", "项目名称", "项目"]);
    const actualHours = numberValue(pick(row, ["实际工时", "工时", "填报工时"]));
    if (!projectNo && !projectName && !actualHours) return [];
    return [{ employeeName: pick(row, ["填报人姓名", "姓名_单行文本", "提交人", "姓名"]), department: pick(row, ["填报人部门", "部门文本", "提交人组织", "部门"]), position: pick(row, ["职位", "岗位"]), date: parseDateValue(pick(row, ["工时提交日期", "当前日期", "日期"])), projectNo, projectName, projectManager: pick(row, ["项目负责人", "项目经理", "负责人"]), taskType: pick(row, ["任务类型", "项目固有任务", "其他任务"]) || "未分类", actualHours, standardHours: numberValue(pick(row, ["标准工时"])), workContent: pick(row, ["工作内容"]), issue: pick(row, ["存在问题"]), issueType: pick(row, ["存在问题类型", "问题类型"]), status: pick(row, ["工时填报状态", "状态"]) || "未知", approvalStatus: pick(row, ["审批结果", "当前审批节点", "审批状态"]) || "未知", instanceStatus: pick(row, ["实例状态"]) || "未知", sourceRow: Number(row.__row || 0) }];
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

function compactDept(value: string) {
  if (!value) return "未填写";
  const parts = value.split("-").map((item) => item.trim()).filter(Boolean);
  return parts.slice(-2).join("-") || value;
}

function hasRealIssue(value: string) {
  const text = value.replace(/\s/g, "");
  if (!text) return false;
  return !/(暂无|暂未|没有|无问题|无\/|^无$|正常|\/)/.test(text) || text.length > 20;
}

function hasOutput(value: string) {
  const text = value.replace(/\s/g, "");
  if (!text) return false;
  const match = text.match(/(?:工作产出|今日产出|产出)[：:](.*?)(?:3[.、]?|明日计划|$)/);
  return Boolean(match?.[1]?.replace(/[\/无暂无没有]/g, ""));
}

function addHours(map: Map<string, { name: string; hours: number }>, key: string, hours: number) {
  const name = key || "未填写";
  const item = map.get(name) ?? { name, hours: 0 };
  item.hours += hours;
  map.set(name, item);
}

function topShare(map: Map<string, { name: string; hours: number }>, total: number, limit = 10) {
  return [...map.values()].sort((a, b) => b.hours - a.hours).slice(0, limit).map((item) => ({ ...item, hours: Number(item.hours.toFixed(1)), share: total ? Number((item.hours / total * 100).toFixed(1)) : 0 }));
}

export function buildProjectViews(projects: ProjectRecord[], tasks: TaskRecord[], now = new Date()): ProjectView[] {
  return projects.map((project) => {
    const projectTasks = tasks.filter((task) => task.projectNo && task.projectNo === project.projectNo);
    const failedTasks = projectTasks.filter((task) => taskBucket(task) === "评审不通过");
    const hasPendingReview = projectTasks.some((task) => taskBucket(task) === "待评审");
    const taskCounts = projectTasks.reduce<Record<string, number>>((acc, task) => { const bucket = taskBucket(task); acc[bucket] = (acc[bucket] ?? 0) + 1; return acc; }, {});
    const reasons: string[] = [];
    const sop = project.sopDate ? new Date(project.sopDate) : null;
    if (sop && !Number.isNaN(sop.getTime()) && sop.getTime() < new Date(now.toDateString()).getTime()) reasons.push("SOP已逾期");
    if (failedTasks.length) reasons.push("存在评审不通过任务");
    let riskLevel: RiskLevel = reasons.length ? "红色" : "绿色";
    if (riskLevel === "绿色" && hasPendingReview) { riskLevel = "黄色"; reasons.push("存在待评审任务"); }
    if (riskLevel === "绿色" && !project.sopDate) { riskLevel = "黄色"; reasons.push("SOP日期为空"); }
    return { ...project, riskLevel, riskReasons: reasons, taskCounts, failedTasks };
  });
}

export function getStats(store: StoreShape) {
  const views = buildProjectViews(store.projects, store.tasks);
  const statusDistribution = views.reduce<Record<string, number>>((acc, p) => { acc[p.status || "未知"] = (acc[p.status || "未知"] ?? 0) + 1; return acc; }, {});
  const taskDistribution = store.tasks.reduce<Record<string, number>>((acc, t) => { const bucket = taskBucket(t); acc[bucket] = (acc[bucket] ?? 0) + 1; return acc; }, {});
  return { projectCount: views.length, runningProjectCount: views.filter((p) => p.status.includes("运行中")).length, pendingSubmitTaskCount: store.tasks.filter((t) => taskBucket(t) === "待提交").length, riskProjectCount: views.filter((p) => p.riskLevel !== "绿色").length, statusDistribution, taskDistribution, projects: views };
}

export function getWorkhourStats(store: StoreShape) {
  const records = store.workhours ?? [];
  const totalHours = records.reduce((sum, row) => sum + row.actualHours, 0);
  const byPosition = new Map<string, { name: string; hours: number }>();
  const byDepartment = new Map<string, { name: string; hours: number }>();
  const byTaskType = new Map<string, { name: string; hours: number }>();
  const byProject = new Map<string, { name: string; hours: number; people: Set<string>; taskTypes: Record<string, number>; issueCount: number; outputCount: number; riskCount: number }>();
  const taskTypeMatrix: Record<string, Record<string, number>> = {};
  for (const row of records) {
    addHours(byPosition, row.position || "未填写岗位", row.actualHours);
    addHours(byDepartment, compactDept(row.department), row.actualHours);
    addHours(byTaskType, row.taskType || "未分类", row.actualHours);
    const projectKey = row.projectNo || row.projectName || "未立项项目";
    const project = byProject.get(projectKey) ?? { name: row.projectName || projectKey, hours: 0, people: new Set<string>(), taskTypes: {}, issueCount: 0, outputCount: 0, riskCount: 0 };
    project.hours += row.actualHours;
    if (row.employeeName) project.people.add(row.employeeName);
    project.taskTypes[row.taskType || "未分类"] = (project.taskTypes[row.taskType || "未分类"] ?? 0) + row.actualHours;
    if (hasRealIssue(row.issue)) project.issueCount += 1;
    if (hasOutput(row.workContent)) project.outputCount += 1;
    if (/严重|延期|风险|瓶颈|不通过|超调|失败|缺少|无法/.test(`${row.issue} ${row.issueType}`)) project.riskCount += 1;
    byProject.set(projectKey, project);
    const dept = compactDept(row.department);
    taskTypeMatrix[dept] ??= {};
    taskTypeMatrix[dept][row.taskType || "未分类"] = (taskTypeMatrix[dept][row.taskType || "未分类"] ?? 0) + row.actualHours;
  }
  const projects = [...byProject.entries()].map(([projectNo, item]) => {
    const riskScore = item.hours * (1 + item.riskCount * 0.18 + item.issueCount * 0.05) / Math.max(1, item.outputCount);
    return { projectNo, projectName: item.name, hours: Number(item.hours.toFixed(1)), people: item.people.size, issueCount: item.issueCount, riskCount: item.riskCount, outputCount: item.outputCount, outputRate: Number((item.outputCount / Math.max(1, item.people.size)).toFixed(2)), taskTypes: Object.fromEntries(Object.entries(item.taskTypes).map(([k, v]) => [k, Number(v.toFixed(1))])), riskScore: Number(riskScore.toFixed(1)) };
  }).sort((a, b) => b.hours - a.hours);
  const highInputLowOutput = projects.filter((p) => p.hours >= Math.max(16, totalHours * 0.02) && (p.outputCount === 0 || p.riskScore > 25 || p.riskCount > 0)).sort((a, b) => b.riskScore - a.riskScore).slice(0, 10);
  const taskTypes = topShare(byTaskType, totalHours, 12);
  const focusTypes = ["项目管理", "软件开发", "标定匹配"];
  return { rowCount: records.length, totalHours: Number(totalHours.toFixed(1)), peopleCount: new Set(records.map((row) => row.employeeName).filter(Boolean)).size, projectCount: byProject.size, byPosition: topShare(byPosition, totalHours, 12), byDepartment: topShare(byDepartment, totalHours, 12), byTaskType: taskTypes, focusTaskTypeShare: taskTypes.filter((item) => focusTypes.some((type) => item.name.includes(type))), topProjects: projects.slice(0, 15), highInputLowOutput, taskTypeMatrix: Object.fromEntries(Object.entries(taskTypeMatrix).map(([dept, values]) => [dept, Object.fromEntries(Object.entries(values).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => [k, Number(v.toFixed(1))]))])) };
}

export function aiPayload(store: StoreShape) {
  const stats = getStats(store);
  return { metrics: { projectCount: stats.projectCount, runningProjectCount: stats.runningProjectCount, pendingSubmitTaskCount: stats.pendingSubmitTaskCount, riskProjectCount: stats.riskProjectCount, statusDistribution: stats.statusDistribution, taskDistribution: stats.taskDistribution }, riskProjects: stats.projects.filter((p) => p.riskLevel !== "绿色").map((p) => ({ projectNo: p.projectNo, projectName: p.projectName, riskLevel: p.riskLevel, reasons: p.riskReasons, sopDate: p.sopDate })), failedTasks: stats.projects.flatMap((p) => p.failedTasks.map((t) => ({ projectNo: p.projectNo, projectName: p.projectName, taskName: t.taskName, status: t.taskStatus, reviewStatus: t.reviewStatus }))) };
}

export function workhourAiPayload(store: StoreShape) {
  const stats = getWorkhourStats(store);
  return { workhourMetrics: { rowCount: stats.rowCount, totalHours: stats.totalHours, peopleCount: stats.peopleCount, projectCount: stats.projectCount }, taskTypeShare: stats.byTaskType, focusTaskTypeShare: stats.focusTaskTypeShare, positionShare: stats.byPosition, departmentShare: stats.byDepartment, topProjects: stats.topProjects.slice(0, 10), highInputLowOutput: stats.highInputLowOutput, taskTypeMatrix: stats.taskTypeMatrix };
}
