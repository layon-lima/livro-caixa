import { currentUser } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import { backTo, forbidden, sameOriginPost } from "@/lib/request-security";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!sameOriginPost(request)) return forbidden();
  const admin = await currentUser();
  if (!admin?.isAdmin) return forbidden();
  const form = await request.formData();
  const nome = String(form.get("nome") || "").trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
  if (nome.length < 3 || nome.length > 120) return backTo("/admin?error=dados");
  const result = await getDatabase().query(
    "INSERT INTO titulares(nome) VALUES($1) ON CONFLICT(nome) DO NOTHING RETURNING id", [nome],
  );
  return backTo(result.rowCount ? "/admin?created=1" : "/admin?error=duplicado");
}
