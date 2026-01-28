import { promises as fs } from "fs";
import path from "path";

const dataDir =
  process.env.SPOTIFY_DATA_DIR ?? path.join(process.cwd(), "data");

export function getDataDir() {
  return dataDir;
}

export async function ensureDataDir() {
  await fs.mkdir(dataDir, { recursive: true });
}

export async function readJsonFile<T>(fileName: string, fallback: T): Promise<T> {
  await ensureDataDir();
  const filePath = path.join(dataDir, fileName);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

export async function writeJsonFile<T>(fileName: string, data: T) {
  await ensureDataDir();
  const filePath = path.join(dataDir, fileName);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}
