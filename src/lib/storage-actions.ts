import "server-only";
import { gunzip, gzip } from "node:zlib";
import { promisify } from "node:util";
import { mkdir, readdir, readFile, stat, statfs, writeFile } from "node:fs/promises";
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
  const root = resolve(/* turbopackIgnore: true */ ROOT);
  const full = resolve(root, key);
  if (!full.startsWith(root + sep)) throw new Error("Caminho inválido");
  return full;
}

async function directoryBytes(dir: string): Promise<number> {
  // Conta blocos reais alocados, inclusive metadados dos diretórios.
  const directory = await stat(dir);
  let total = directory.blocks * 512;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) total += await directoryBytes(full);
    else if (entry.isFile()) total += (await stat(full)).blocks * 512;
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
  // Uma falha após gravar o arquivo, mas antes de confirmar o banco,
  // pode deixar um original órfão. Reaproveitá-lo é mais seguro do que
  // apagar o arquivo ou ignorá-lo na contagem da cota.
  let existing: Buffer | null = null;
  try { existing = await readFile(/* turbopackIgnore: true */ full); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (existing) {
    if (!existing.equals(compressed)) throw new Error("Arquivo local existente não confere com o conteúdo enviado.");
    return;
  }
  const used = await physicalStorageBytes();
  const disk = await statfs(ROOT);
  const allocated = Math.ceil(compressed.length / disk.bsize) * disk.bsize;
  if (used + allocated > STORAGE_LIMIT_BYTES) {
    throw new StorageFullError("Limite de 20 GB dos documentos atingido. Solicite ao administrador a liberação de espaço antes de importar mais.");
  }
  const free = disk.bavail * disk.bsize;
  if (free < allocated + FREE_DISK_RESERVE_BYTES) {
    throw new StorageFullError("Espaço livre insuficiente na VPS. O sistema preserva 2 GB livres para os demais aplicativos.");
  }
  await writeFile(full, compressed, { flag: "wx", mode: 0o600 });
}

export async function readOriginal(key: string, armazenamento = "local"): Promise<Uint8Array> {
  if (armazenamento !== "local") {
    throw new Error("Este arquivo antigo ainda usa o armazenamento anterior; é necessária migração.");
  }
  const data = await readFile(/* turbopackIgnore: true */ localPath(key));
  return gunzipAsync(data);
}
