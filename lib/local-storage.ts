import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

function getRoot() {
  return path.resolve(process.env.LOCAL_STORAGE_ROOT || path.join(process.cwd(), ".local-storage"));
}

function assertSafePath(value: string) {
  const normalized = value.replace(/^\/+/, "");
  const resolved = path.resolve(getRoot(), normalized);
  const root = getRoot();

  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error("Ongeldig opslagpad.");
  }

  return resolved;
}

export function getStoragePath(bucket: string, filePath: string) {
  return assertSafePath(path.join(bucket, filePath));
}

export async function readStoredFile(bucket: string, filePath: string) {
  const fullPath = getStoragePath(bucket, filePath);
  return readFile(fullPath);
}

export async function writeStoredFile(bucket: string, filePath: string, data: Buffer | Uint8Array | string) {
  const fullPath = getStoragePath(bucket, filePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, data);
}

export async function removeStoredFiles(bucket: string, paths: string[]) {
  for (const filePath of paths) {
    const fullPath = getStoragePath(bucket, filePath);
    await rm(fullPath, { force: true });
  }
}

export async function ensureBucket(bucket: string) {
  await mkdir(getStoragePath(bucket, "."), { recursive: true });
}

export async function blobToBuffer(value: Blob | File | Buffer | Uint8Array | string) {
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === "string") return Buffer.from(value);
  if (value instanceof Uint8Array) return Buffer.from(value);
  return Buffer.from(await value.arrayBuffer());
}
