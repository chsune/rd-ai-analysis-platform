export type ProjectRecord = {
  instanceId: string;
  projectNo: string;
  projectName: string;
  productSeries: string;
  manager: string;
  sopDate: string;
  status: string;
  approvalStatus: string;
  modifiedAt: string;
  sourceRow: number;
};

export type TaskRecord = {
  projectNo: string;
  taskName: string;
  taskStatus: string;
  reviewStatus: string;
  owner: string;
  modifiedAt: string;
  sourceRow: number;
};

export type RiskLevel = "红色" | "黄色" | "绿色";

export type ProjectView = ProjectRecord & {
  riskLevel: RiskLevel;
  riskReasons: string[];
  taskCounts: Record<string, number>;
  failedTasks: TaskRecord[];
};

export type StoreShape = {
  projects: ProjectRecord[];
  tasks: TaskRecord[];
  projectUploadAt: string;
  taskUploadAt: string;
  prompt: string;
  analysis: string;
  analysisAt: string;
  workhourPrompt: string;
  workhourAnalysis: string;
  workhourAnalysisAt: string;
  deepseekApiKey: string;
  deepseekBaseUrl: string;
  deepseekModel: string;
};
