import "server-only";
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getR2Bucket, getR2Client } from "@/lib/storage";

export function r2Ready(): boolean {
  return ["R2_ACCOUNT_ID","R2_ACCESS_KEY_ID","R2_SECRET_ACCESS_KEY","R2_BUCKET"]
    .every(key => Boolean(process.env[key]));
}
export async function storeOriginal(key: string, content: Buffer, mime: string): Promise<void> {
  await getR2Client().send(new PutObjectCommand({
    Bucket: getR2Bucket(), Key: key, Body: content, ContentType: mime,
  }));
}
export async function readOriginal(key: string): Promise<Uint8Array> {
  const r = await getR2Client().send(new GetObjectCommand({ Bucket:getR2Bucket(),Key:key }));
  if (!r.Body) throw new Error("Arquivo não encontrado no armazenamento");
  return await r.Body.transformToByteArray();
}
export async function deleteOriginal(key: string): Promise<void> {
  await getR2Client().send(new DeleteObjectCommand({Bucket:getR2Bucket(),Key:key}));
}
