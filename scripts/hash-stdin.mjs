import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const password = Buffer.concat(chunks).toString("utf8");
if (password.length < 12 || password.length > 128) {
  process.stderr.write("A senha precisa ter de 12 a 128 caracteres.\n");
  process.exit(1);
}
const salt = randomBytes(16).toString("hex");
const hash = await promisify(scryptCallback)(password, salt, 64);
process.stdout.write(["scrypt", salt, hash.toString("hex")].join("$") + "\n");
