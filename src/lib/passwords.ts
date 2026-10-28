import "server-only";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(scryptCallback);

export function validPassword(password: string): boolean {
  return password.length >= 12 && password.length <= 128;
}
export async function hashPassword(password: string): Promise<string> {
  if (!validPassword(password)) throw new Error("Senha inválida");
  const salt = randomBytes(16).toString("hex");
  const digest = (await scrypt(password, salt, 64)) as Buffer;
  return ["scrypt", salt, digest.toString("hex")].join("$");
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (password.length > 128 || password.length === 0) return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hex] = parts;
  if (!/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(hex)) return false;
  const expected = Buffer.from(hex, "hex");
  const derived = (await scrypt(password, salt, expected.length)) as Buffer;
  return timingSafeEqual(derived, expected);
}
