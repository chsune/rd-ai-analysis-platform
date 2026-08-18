import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { emptyStore } from "./normalize";
import type { StoreShape } from "./types";

const storePath = path.join(process.cwd(), "data", "store.json");
const tmpStorePath = path.join(process.env.TMPDIR || process.env.TEMP || "/tmp", "rd-ai-analysis-store.json");
const state = globalThis as typeof globalThis & { __RD_FILE_STORE?: StoreShape };

async function tryRead(filePath: string) {
  const raw = await readFile(filePath, "utf8");
  return { ...emptyStore(), ...JSON.parse(raw) };
}

async function tryWrite(filePath: string, store: StoreShape) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(store, null, 2), "utf8");
}

export async function readStore(): Promise<StoreShape> {
  if (state.__RD_FILE_STORE) return state.__RD_FILE_STORE;
  try {
    const store = await tryRead(storePath);
    state.__RD_FILE_STORE = store;
    return store;
  } catch {
    try {
      const store = await tryRead(tmpStorePath);
      state.__RD_FILE_STORE = store;
      return store;
    } catch {
      const store = emptyStore();
      state.__RD_FILE_STORE = store;
      return store;
    }
  }
}

export async function writeStore(store: StoreShape) {
  state.__RD_FILE_STORE = store;
  try {
    await tryWrite(storePath, store);
  } catch {
    await tryWrite(tmpStorePath, store);
  }
}
