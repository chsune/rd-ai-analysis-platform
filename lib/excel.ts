import JSZip from "jszip";
import * as XLSX from "xlsx";

type SheetRow = Record<string, string>;

const abnormal = /^选项[一二三四五六七八九十0-9]+$/;

function cleanValue(value: unknown) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return abnormal.test(text) ? "数据异常" : text;
}

function decodeXml(text: string) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function colIndex(cellRef: string) {
  const letters = cellRef.replace(/[0-9]/g, "");
  let index = 0;
  for (const char of letters) index = index * 26 + char.charCodeAt(0) - 64;
  return index - 1;
}

function parseSharedStrings(xml: string) {
  const values: string[] = [];
  for (const match of xml.matchAll(/<si[\s\S]*?<\/si>/g)) {
    const text = [...match[0].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
      .map((m) => decodeXml(m[1]))
      .join("");
    values.push(text);
  }
  return values;
}

async function parseXmlFallback(buffer: Buffer | Uint8Array): Promise<SheetRow[]> {
  const zip = await JSZip.loadAsync(buffer);
  const workbookXml = await zip.file("xl/workbook.xml")?.async("string");
  const relsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  if (!workbookXml || !relsXml) return [];

  const rels = new Map<string, string>();
  for (const rel of relsXml.matchAll(/<Relationship[^>]+Id="([^"]+)"[^>]+Target="([^"]+)"/g)) {
    rels.set(rel[1], rel[2].replace(/^\//, ""));
  }
  const firstSheet = workbookXml.match(/<sheet[^>]+r:id="([^"]+)"/);
  const target = firstSheet ? rels.get(firstSheet[1]) : "worksheets/sheet1.xml";
  const sheetPath = target?.startsWith("xl/") ? target : `xl/${target}`;
  const sheetXml = sheetPath ? await zip.file(sheetPath)?.async("string") : undefined;
  if (!sheetXml) return [];

  const sharedXml = await zip.file("xl/sharedStrings.xml")?.async("string");
  const shared = sharedXml ? parseSharedStrings(sharedXml) : [];
  const rows: string[][] = [];
  for (const rowMatch of sheetXml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const cell of rowMatch[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cell[1];
      const body = cell[2];
      const ref = attrs.match(/r="([^"]+)"/)?.[1] ?? "";
      const type = attrs.match(/t="([^"]+)"/)?.[1] ?? "";
      const index = ref ? colIndex(ref) : row.length;
      const inline = body.match(/<is[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/)?.[1];
      const raw = body.match(/<v[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? inline ?? "";
      row[index] = type === "s" ? shared[Number(raw)] ?? "" : decodeXml(raw);
    }
    if (row.some((v) => cleanValue(v))) rows.push(row);
  }
  return rowsToObjects(rows);
}

function rowsToObjects(rows: string[][]): SheetRow[] {
  const knownHeaders = ["项目编号", "项目名称", "实际工时", "标准工时", "任务类型", "工作内容", "存在问题", "职位", "填报人姓名", "实例ID"];
  const candidates = rows.slice(0, 12).map((row, index) => {
    const cleaned = row.map(cleanValue);
    const score = knownHeaders.reduce((sum, name) => sum + (cleaned.some((cell) => cell.includes(name)) ? 4 : 0), 0) + new Set(cleaned.filter(Boolean)).size;
    return { index, score, count: cleaned.filter(Boolean).length };
  }).filter((item) => item.count >= 2);
  const headerIndex = candidates.sort((a, b) => b.score - a.score)[0]?.index ?? -1;
  if (headerIndex < 0) return [];
  const headers = rows[headerIndex].map((h, i) => cleanValue(h) || `列${i + 1}`);
  return rows.slice(headerIndex + 1).flatMap((row, offset) => {
    const obj: SheetRow = {};
    headers.forEach((h, i) => (obj[h] = cleanValue(row[i])));
    const values = Object.values(obj);
    if (!values.some(Boolean)) return [];
    const repeatedHeader = headers.every((h, i) => !row[i] || cleanValue(row[i]) === h);
    if (repeatedHeader) return [];
    obj.__row = String(headerIndex + offset + 2);
    return [obj];
  });
}

export async function parseExcel(buffer: Buffer | Uint8Array): Promise<SheetRow[]> {
  try {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, dense: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { defval: "", raw: false, header: 1 });
    const parsed = rowsToObjects(rows);
    const realRows = parsed.filter((row) => Object.entries(row).some(([k, v]) => k !== "__row" && v));
    if (realRows.length > 1) return realRows;
  } catch {
    return parseXmlFallback(buffer);
  }
  return parseXmlFallback(buffer);
}

export function pick(row: SheetRow, names: string[]) {
  const entries = Object.entries(row);
  for (const name of names) {
    const direct = row[name];
    if (direct) return direct;
    const loose = entries.find(([key]) => key.replace(/\s/g, "").includes(name.replace(/\s/g, "")));
    if (loose?.[1]) return loose[1];
  }
  return "";
}
