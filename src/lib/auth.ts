import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDatabase } from "@/lib/database";

export const SESSION_COOKIE = "lc_session";
export type AuthUser = { id: number; username: string; isAdmin: boolean };

export function tokenDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
export function createSessionToken(): string {
  return randomBytes(32).toString("hex");
}
export async function currentUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const result = await getDatabase().query<{
    id: string; username: string; is_admin: boolean;
  }>(
    "SELECT u.id::text AS id, u.username, u.is_admin " +
    "FROM user_sessions s JOIN users u ON u.id = s.user_id " +
    "WHERE s.token_hash = $1 AND s.expires_at > now() AND u.is_active = TRUE LIMIT 1",
    [tokenDigest(token)],
  );
  const row = result.rows[0];
  return row ? { id: Number(row.id), username: row.username, isAdmin: row.is_admin } : null;
}
export async function requireUser(): Promise<AuthUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}
export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/");
  return user;
}
export async function canAccessTitular(user: AuthUser, titularId: number, action: "view" | "import" | "approve" | "edit" | "delete"): Promise<boolean> {
  if (user.isAdmin) return true;
  const column = ({
    view: "can_view", import: "can_import", approve: "can_approve",
    edit: "can_edit", delete: "can_delete",
  } as const)[action];
  const result = await getDatabase().query<{ allowed: boolean }>(
    "SELECT " + column + " AS allowed FROM user_titular_permissions WHERE user_id = $1 AND titular_id = $2",
    [user.id, titularId],
  );
  return result.rows[0]?.allowed === true;
}
