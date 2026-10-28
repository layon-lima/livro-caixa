import "server-only";
import { Pool } from "pg";

const globalPool = globalThis as typeof globalThis & {
  __livroCaixaPgPool?: Pool;
};

/** A conexão é aberta sob demanda pelos módulos de dados futuros. */
export function getDatabase(): Pool {
  if (!globalPool.__livroCaixaPgPool) {
    const required = ["PGHOST", "PGDATABASE", "PGUSER", "PGPASSWORD"] as const;
    for (const key of required) {
      if (!process.env[key]) {
        throw new Error(`Configuração ausente: ${key}`);
      }
    }

    globalPool.__livroCaixaPgPool = new Pool({
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      max: 10,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
    });
  }

  return globalPool.__livroCaixaPgPool;
}
