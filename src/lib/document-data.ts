import "server-only";
import { getDatabase } from "@/lib/database";
import { canAccessTitular, type AuthUser } from "@/lib/auth";

export type Titular = { id: string; nome: string };
export type Categoria = { id: string; nome: string; subcategoria: string };
export type Operacao = {
  id: string; titular_id: string; titulo: string; competencia: string; categoria_id: string | null;
  categoria: string | null; subcategoria: string | null;
  tipo: string; contraparte: string; descricao: string; referencia: string;
  valor: string | null; quantidade_documentos: string; criado_em: string; excluido_em: string | null;
};
export type Proposta = {
  id: string; arquivo_id: string; titular_id: string; titulo: string; documento_tipo: string;
  contraparte: string; competencia: string; competencia_estimada: boolean;
  categoria_id: string | null; tipo: string; descricao: string; valor: string | null; referencia: string;
  nome_original: string; status: string; erro: string | null; texto_extraido: string;
  pagina_inicial: number | null; pagina_final: number | null;
  metodo_leitura: "local"|"ia"|"xml"; confianca: string|null; avisos: string[];
  titular_sugerido: string;
  consulta_empresa: {cnpj?:string;status?:string;razao_social?:string;nome_fantasia?:string;atividade?:string;codigo_cnae?:string;fonte?:string};
  revisada_em: string | null; operacao_sugerida_id: string | null; aprovado_em: string | null; duplicada_de: string | null;
};
export function safeId(input: unknown): number | null {
  const n = Number(input);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
export async function titularesPermitidos(user: AuthUser, action: "view" | "import" | "approve" | "edit" | "delete" = "view"): Promise<Titular[]> {
  const db = getDatabase();
  if (user.isAdmin) {
    const r = await db.query<Titular>("SELECT id::text AS id,nome FROM titulares ORDER BY nome");
    return r.rows;
  }
  const col = ({view:"can_view",import:"can_import",approve:"can_approve",edit:"can_edit",delete:"can_delete"} as const)[action];
  const r = await db.query<Titular>(
    "SELECT t.id::text AS id,t.nome FROM titulares t JOIN user_titular_permissions p ON p.titular_id=t.id " +
    "WHERE p.user_id=$1 AND p." + col + "=true ORDER BY t.nome",[user.id],
  );
  return r.rows;
}
export async function categorias(): Promise<Categoria[]> {
  const r = await getDatabase().query<Categoria>("SELECT id::text AS id,nome,subcategoria FROM categorias ORDER BY nome,subcategoria");
  return r.rows;
}
export function basePath(returnTo: string | null | undefined, fallback: string): string {
  if (!returnTo || !/^\/(?:livros\/\d+|conferencia|importar|operacoes\/\d+)(?:\?[a-zA-Z0-9&=_%-]*)?$/.test(returnTo)) return fallback;
  return returnTo;
}
export async function permit(user: AuthUser, id: number, action: "view"|"import"|"approve"|"edit"|"delete"): Promise<boolean> {
  return canAccessTitular(user,id,action);
}
export function competence(value: unknown): string | null {
  const text=String(value||"").trim();
  if (!/^(19|20)\d\d-(0[1-9]|1[012])$/.test(text)) return null;
  return text+"-01";
}
