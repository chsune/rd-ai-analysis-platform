import { NextResponse } from "next/server";
import { parseExcel } from "@/lib/excel";
import { normalizeProjects, normalizeTasks, normalizeWorkhours } from "@/lib/normalize";
import { readStore, writeStore } from "@/lib/store";

export async function POST(request: Request) {
  const form = await request.formData();
  const type = String(form.get("type") || "");
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ message: "请上传 Excel 文件" }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const rows = await parseExcel(buffer);
  const store = await readStore();
  if (type === "projects") {
    store.projects = normalizeProjects(rows);
    store.projectUploadAt = new Date().toISOString();
  } else if (type === "tasks") {
    store.tasks = normalizeTasks(rows);
    store.taskUploadAt = new Date().toISOString();
  } else if (type === "workhours") {
    store.workhours = normalizeWorkhours(rows);
    store.workhourUploadAt = new Date().toISOString();
  } else {
    return NextResponse.json({ message: "未知上传类型" }, { status: 400 });
  }
  await writeStore(store);
  const savedRows = type === "projects" ? store.projects.length : type === "tasks" ? store.tasks.length : store.workhours.length;
  return NextResponse.json({ ok: true, rawRows: rows.length, savedRows });
}
