import "server-only";
import { S3Client } from "@aws-sdk/client-s3";

let client: S3Client | undefined;

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Configuração ausente: ${key}`);
  return value;
}

/** Usar apenas no servidor, depois que as permissões forem implementadas. */
export function getR2Client(): S3Client {
  if (!client) {
    const accountId = required("R2_ACCOUNT_ID");
    client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: required("R2_ACCESS_KEY_ID"),
        secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
      },
    });
  }
  return client;
}

export function getR2Bucket(): string {
  return required("R2_BUCKET");
}
