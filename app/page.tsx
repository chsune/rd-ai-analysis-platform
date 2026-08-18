"use client";

import { useEffect, useMemo, useState } from "react";

type Project = {
  instanceId: string;
  projectNo: string;
  projectName: string;
  productSeries: string;
  manager: string;
  sopDate: string;
  status: string;
  approvalStatus: string;
  riskLevel: "红色" | "黄色" | "绿色";
  riskReasons: string[];
  taskCounts: Record<string, number>;
  failedTasks: { taskName: string; taskStatus: string; reviewStatus: string; owner: string }[];
};

type DataState = {
  projectCount: number;
  runningProjectCount: number;
  pendingSubmitTaskCount: number;
  riskProjectCount: number;
  statusDistribution: Record<string, number>;
  taskDistribution: Record<string, number>;
  projects: Project[];
  projectUploadAt: string;
  taskUploadAt: string;
  projectRows: number;
  taskRows: number;
  prompt: string;
  analysis: string;
  analysisAt: string;
  workhourPrompt: string;
  workhourAnalysis: string;
  workhourAnalysisAt: string;
  deepseekBaseUrl: string;
  deepseekModel: string;
  hasDeepseekApiKey: boolean;
};

const emptyData: DataState = {
  projectCount: 0,
  runningProjectCount: 0,
  pendingSubmitTaskCount: 0,
  riskProjectCount: 0,
  statusDistribution: {},
  taskDistribution: {},
  projects: [],
  projectUploadAt: "",
  taskUploadAt: "",
  projectRows: 0,
  taskRows: 0,
  prompt: "",
  analysis: "",
  analysisAt: "",
  workhourPrompt: "",
  workhourAnalysis: "",
  workhourAnalysisAt: "",
  deepseekBaseUrl: "https://api.deepseek.com",
  deepseekModel: "deepseek-chat",
  hasDeepseekApiKey: false
};

function fmt(value: string) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "尚未上传";
}

function riskClass(level: string) {
  return level === "红色" ? "red" : level === "黄色" ? "yellow" : "green";
}

function Analysis({ value }: { value: string }) {
  if (!value) return <div className="empty">尚未生成AI分析</div>;
  return <div className="analysis">{value.split(/\n/).map((line, i) => /^\s*[123][.、]/.test(line) ? <h3 key={i}>{line}</h3> : <p key={i}>{line || "\u00a0"}</p>)}</div>;
}

function Bars({ data }: { data: Record<string, number> }) {
  const max = Math.max(1, ...Object.values(data));
  const rows = Object.entries(data);
  if (!rows.length) return <div className="empty">暂无数据</div>;
  return <div className="bars">{rows.map(([k, v]) => <div className="bar" key={k}><span>{k}</span><i><b style={{ width: `${Math.max(8, v / max * 100)}%` }} /></i><em>{v}</em></div>)}</div>;
}

export default function Page() {
  const [token, setToken] = useState("");
  const [login, setLogin] = useState({ username: "admin", password: "Admin@2026" });
  const [tab, setTab] = useState<"oa" | "workhours" | "settings">("oa");
  const [data, setData] = useState<DataState>(emptyData);
  const [selectedNo, setSelectedNo] = useState("");
  const [q, setQ] = useState("");
  const [prompt, setPrompt] = useState("");
  const [workhourPrompt, setWorkhourPrompt] = useState("");
  const [deepseekApiKey, setDeepseekApiKey] = useState("");
  const [deepseekBaseUrl, setDeepseekBaseUrl] = useState("https://api.deepseek.com");
  const [deepseekModel, setDeepseekModel] = useState("deepseek-chat");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const json = await fetch("/api/data").then((r) => r.json());
    setData(json);
    setPrompt(json.prompt || "");
    setWorkhourPrompt(json.workhourPrompt || "");
    setDeepseekBaseUrl(json.deepseekBaseUrl || "https://api.deepseek.com");
    setDeepseekModel(json.deepseekModel || "deepseek-chat");
    if (!selectedNo && json.projects?.[0]) setSelectedNo(json.projects[0].projectNo || json.projects[0].instanceId);
  }

  useEffect(() => {
    const saved = localStorage.getItem("mvp-token") || "";
    setToken(saved);
    if (saved) load();
  }, []);

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/login", { method: "POST", body: JSON.stringify(login) });
    if (!res.ok) return setError("账号或密码错误");
    localStorage.setItem("mvp-token", "mvp-admin");
    setToken("mvp-admin");
    await load();
  }

  async function saveSettings() {
    setBusy("正在保存设置...");
    await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, workhourPrompt, deepseekApiKey, deepseekBaseUrl, deepseekModel }) });
    setDeepseekApiKey("");
    await load();
    setBusy("");
  }

  async function analyze(type: "oa" | "workhours") {
    await saveSettings();
    setBusy("正在生成AI分析...");
    await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type }) });
    await load();
    setBusy("");
  }

  async function upload(type: "projects" | "tasks", file?: File) {
    if (!file) return;
    setBusy("正在上传Excel...");
    const form = new FormData();
    form.append("type", type);
    form.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: form });
    if (!res.ok) alert((await res.json()).message || "上传失败");
    await load();
    setBusy("");
  }

  const filtered = useMemo(() => data.projects.filter((p) => `${p.projectNo} ${p.projectName}`.toLowerCase().includes(q.toLowerCase())), [data.projects, q]);
  const selected = data.projects.find((p) => (p.projectNo || p.instanceId) === selectedNo) || data.projects[0];

  if (!token) {
    return <main className="login"><form onSubmit={doLogin}><h1>研发项目AI分析平台</h1><label>账号<input value={login.username} onChange={(e) => setLogin({ ...login, username: e.target.value })} /></label><label>密码<input type="password" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} /></label>{error && <p className="err">{error}</p>}<button className="primary">登录</button></form></main>;
  }

  return <main className="shell">
    <aside><h2>研发项目AI分析平台</h2><button className={tab === "oa" ? "active" : ""} onClick={() => setTab("oa")}>研发项目OA分析</button><button className={tab === "workhours" ? "active" : ""} onClick={() => setTab("workhours")}>工时系统分析</button><button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>数据与AI设置</button><button onClick={() => { localStorage.removeItem("mvp-token"); setToken(""); }}>退出</button></aside>
    <section className="content">{busy && <div className="toast">{busy}</div>}
      {tab === "oa" && <><div className="title"><h1>研发项目OA分析</h1><p>AI分析信息置顶，统计信息由代码计算。</p></div><section className="panel hero"><h2>AI分析信息</h2><Analysis value={data.analysis} /></section><Stats data={data} /><Charts data={data} /><ProjectTable projects={filtered} selectedNo={selectedNo} setSelectedNo={setSelectedNo} q={q} setQ={setQ} />{selected && <Detail project={selected} />}</>}
      {tab === "workhours" && <><div className="title"><h1>工时系统分析</h1><p>独立Prompt，独立分析结果。</p></div><section className="panel hero"><h2>AI分析信息</h2><Analysis value={data.workhourAnalysis} /></section><Stats data={data} failed /><section className="panel"><h2>工时系统分析Prompt</h2><textarea rows={7} value={workhourPrompt} onChange={(e) => setWorkhourPrompt(e.target.value)} /><div className="actions"><button className="primary" onClick={() => analyze("workhours")}>生成工时系统分析</button></div></section></>}
      {tab === "settings" && <><div className="title"><h1>数据与AI设置</h1><p>上传Excel并设置DeepSeek兼容接口。</p></div><section className="panel upload"><label><b>项目立项 Excel</b><span>最后上传：{fmt(data.projectUploadAt)}，数据条数：{data.projectRows}</span><input type="file" accept=".xlsx,.xls" onChange={(e) => upload("projects", e.target.files?.[0])} /></label><label><b>标定清单 Excel</b><span>最后上传：{fmt(data.taskUploadAt)}，数据条数：{data.taskRows}</span><input type="file" accept=".xlsx,.xls" onChange={(e) => upload("tasks", e.target.files?.[0])} /></label></section><section className="panel"><h2>研发项目OA分析Prompt</h2><textarea rows={6} value={prompt} onChange={(e) => setPrompt(e.target.value)} /><h2>工时系统分析Prompt</h2><textarea rows={6} value={workhourPrompt} onChange={(e) => setWorkhourPrompt(e.target.value)} /><h2>DeepSeek接口设置</h2><div className="settings"><label>API Key<input type="password" value={deepseekApiKey} placeholder={data.hasDeepseekApiKey ? "已配置，输入新Key可替换" : "请输入DeepSeek API Key"} onChange={(e) => setDeepseekApiKey(e.target.value)} /></label><label>Base URL<input value={deepseekBaseUrl} onChange={(e) => setDeepseekBaseUrl(e.target.value)} /></label><label>模型名<input value={deepseekModel} placeholder="如 dsv4pro" onChange={(e) => setDeepseekModel(e.target.value)} /></label></div><p className="hint">后端调用 Base URL + /chat/completions，可填写 dsv4pro 等兼容模型名。</p><div className="actions"><button onClick={saveSettings}>保存设置</button><button className="primary" onClick={() => analyze("oa")}>生成研发项目OA分析</button></div></section><section className="panel"><h2>DeepSeek返回的研发项目OA分析结果</h2><Analysis value={data.analysis || "尚未生成AI分析。未配置 API Key 时启用 Mock 模式。"} /></section></>}
    </section>
  </main>;
}

function Stats({ data, failed }: { data: DataState; failed?: boolean }) {
  return <section className="panel"><h2>统计信息</h2><div className="metrics"><div><span>项目数量</span><b>{data.projectCount}</b></div><div><span>运行中项目数量</span><b>{data.runningProjectCount}</b></div><div><span>待提交任务数量</span><b>{data.pendingSubmitTaskCount}</b></div><div><span>{failed ? "不通过任务数量" : "风险项目数量"}</span><b>{failed ? data.projects.reduce((s, p) => s + p.failedTasks.length, 0) : data.riskProjectCount}</b></div></div></section>;
}

function Charts({ data }: { data: DataState }) {
  return <div className="grid"><section className="panel"><h2>项目状态分布</h2><Bars data={data.statusDistribution} /></section><section className="panel"><h2>任务状态分布</h2><Bars data={data.taskDistribution} /></section></div>;
}

function ProjectTable({ projects, selectedNo, setSelectedNo, q, setQ }: { projects: Project[]; selectedNo: string; setSelectedNo: (v: string) => void; q: string; setQ: (v: string) => void }) {
  return <section className="panel"><input placeholder="项目名称/编号搜索" value={q} onChange={(e) => setQ(e.target.value)} /><div className="table"><table><thead><tr><th>项目编号</th><th>项目名称</th><th>产品系列</th><th>项目经理</th><th>SOP节点</th><th>项目状态</th><th>风险等级</th></tr></thead><tbody>{projects.map((p) => <tr key={p.instanceId} className={selectedNo === (p.projectNo || p.instanceId) ? "picked" : ""} onClick={() => setSelectedNo(p.projectNo || p.instanceId)}><td>{p.projectNo}</td><td>{p.projectName}</td><td>{p.productSeries}</td><td>{p.manager}</td><td>{p.sopDate || "未填写"}</td><td>{p.status}</td><td><i className={riskClass(p.riskLevel)}>{p.riskLevel}</i></td></tr>)}</tbody></table></div></section>;
}

function Detail({ project }: { project: Project }) {
  return <section className="panel"><h2>项目详情</h2><div className="detail"><div><span>项目编号</span><b>{project.projectNo}</b></div><div><span>项目名称</span><b>{project.projectName}</b></div><div><span>产品系列</span><b>{project.productSeries || "未填写"}</b></div><div><span>项目经理</span><b>{project.manager || "未填写"}</b></div><div><span>SOP节点</span><b>{project.sopDate || "未填写"}</b></div><div><span>审批/评审状态</span><b>{project.approvalStatus}</b></div></div><h2>任务状态数量</h2><div className="chips">{Object.entries(project.taskCounts).map(([k, v]) => <span key={k}>{k}<b>{v}</b></span>)}</div><h2>不通过任务列表</h2>{project.failedTasks.length ? project.failedTasks.map((t, i) => <p key={i} className="failed">{t.taskName} - {t.reviewStatus || t.taskStatus}</p>) : <div className="empty">暂无不通过任务</div>}</section>;
}
