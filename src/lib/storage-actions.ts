import "server-only";
import { gunzip, gzip } from "node:zlib";
import { promisify } from "node:util";
import { mkdir, readdir, readFile, stat, statfs, writeFile, unlink } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const ROOT = process.env.LC_STORAGE_DIR || "/data/livro-caixa-arquivos";

/** Limite decimal de 20 GB SOMENTE para originais compactados. */
export const STORAGE_LIMIT_BYTES = 20_000_000_000;
/** Proteção adicional para outros serviços compartilhando o disco da VPS. */
export const FREE_DISK_RESERVE_BYTES = 2_000_000_000;

export class StorageFullError extends Error {
  constructor(message: string) { super(message); this.name = "StorageFullError"; }
}

export function localKey(sha256: string): string {
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error("Hash inválido");
  return "originais/" + sha256.slice(0, 2) + "/" + sha256 + ".gz";
}

function localPath(key: string): string {
  if (!/^originais\/[a-f0-9]{2}\/[a-f0-9]{64}\.gz$/.test(key)) {
    throw new Error("Chave de armazenamento inválida");
  }
  const root = resolve(ROOT);
  const full = resolve(root, key);
  if (!full.startsWith(root + sep)) throw new Error("Caminho inválido");
  return full;
}

async function directoryBytes(dir: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) total += await directoryBytes(full);
    else if (entry.isFile()) total += (await stat(full)).size;
    else throw new Error("Entrada inesperada no armazenamento: " + entry.name);
  }
  return total;
}

export async function physicalStorageBytes(): Promise<number> {
  await mkdir(ROOT, { recursive: true });
  return directoryBytes(ROOT);
}

export async function compressedOriginal(content: Buffer): Promise<Buffer> {
  // Gzip sem perdas: ao abrir, o PDF/XML/imagem volta exatamente aos bytes originais.
  return gzipAsync(content, { level: 6 });
}

/**
 * Deve ser chamado com pg_advisory_xact_lock dentro de uma transação aberta,
 * para serializar uploads concorrentes em todos os processos do aplicativo.
 * Escaneia o volume INCLUSIVE arquivos órfãos após interrupções inesperadas.
 */
export async function writeCompressedOriginal(key: string, compressed: Buffer): Promise<void> {
  const full = localPath(key);
  await mkdir(dirname(full), { recursive: true });
  const used = await physicalStorageBytes();
  if (used + compressed.length > STORAGE_LIMIT_BYTES) {
    throw new StorageFullError("Limite de 20 GB dos documentos atingido. Exclua ou arquive documentos antes de importar mais.");
  }
  const disk = await statfs(ROOT);
  const free = disk.bavail * disk.bsize;
  if (free < compressed.length + FREE_DISK_RESERVE_BYTES) {
    throw new StorageFullError("Espaço livre insuficiente na VPS. O sistema preserva 2 GB livres para os demais aplicativos.");
  }
  await writeFile(full, compressed, { flag: "wx", mode: 0o600 });
}

export async function cleanupFailedWrite(key: string): Promise<void> {
  try { await unlink(localPath(key)); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
}

export async function readOriginal(key: string, armazenamento = "local"): Promise<Uint8Array> {
  if (armazenamento !== "local") {
    throw new Error("Este arquivo antigo ainda usa o armazenamento anterior; é necessária migração.");
  }
  const data = await readFile(localPath(key));
  return gunzipAsync(data);
}
