import { StandaloneWorkspace } from "@/components/standalone-workspace";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import { AdminPasswordInput } from "@/components/admin-password-input";
import { BookOpen, ChevronLeft, LockKeyhole, Settings2 } from "lucide-react";
export const dynamic = "force-dynamic";

type Titular = { id: string; nome: string };
type UserRow = { id: string; username: string; is_admin: boolean; is_active: boolean };
type PermRow = {
  user_id: string; titular_id: string;
  can_view: boolean; can_import: boolean; can_approve: boolean; can_edit: boolean; can_delete: boolean;
};
type Action = { field: keyof Pick<PermRow, "can_view" | "can_import" | "can_approve" | "can_edit" | "can_delete">; name: string };
const actions: Action[] = [
  { field: "can_view", name: "Consultar" }, { field: "can_import", name: "Importar" },
  { field: "can_approve", name: "Aprovar" }, { field: "can_edit", name: "Editar" },
  { field: "can_delete", name: "Excluir" },
];

export default async function Admin({ searchParams }: {
  searchParams: Promise<{ error?: string; created?: string; saved?: string; sugerir_titular?: string }>;
}) {
  await requireAdmin();
  const db = getDatabase();
  const [titulares, usuarios, permissoes, status] = await Promise.all([
    db.query<Titular>("SELECT id::text AS id,nome FROM titulares ORDER BY nome"),
    db.query<UserRow>("SELECT id::text AS id,username,is_admin,is_active FROM users ORDER BY is_admin DESC,username"),
    db.query<PermRow>("SELECT user_id::text AS user_id,titular_id::text AS titular_id,can_view,can_import,can_approve,can_edit,can_delete FROM user_titular_permissions"),
    searchParams,
  ]);

  const catRows = await db.query<{id:string;nome:string;subcategoria:string}>(
    "SELECT id::text,nome,subcategoria FROM categorias ORDER BY nome,subcategoria"
  );
  const matrix = new Map(permissoes.rows.map(p => [p.user_id + ":" + p.titular_id, p]));
  return (
    <StandaloneWorkspace title="Administração" section="admin">
    <div className="admin-shell">
      <header className="admin-header">
        <div className="admin-brand"><BookOpen size={18} /><strong>Livro Caixa</strong><span> / Administração</span></div>
        <Link href="/" className="small-link"><ChevronLeft size={15} /> Voltar aos livros</Link>
      </header>
      <main className="admin-main">
        <div className="admin-page-title"><Settings2 size={20} /><h1>Administração</h1></div>
        {status.error && <p className="form-error" role="alert">
          {status.error === "duplicado" ? "Registro já existente." : "Verifique as informações e tente novamente."}
        </p>}
        {(status.saved === "1" || status.created === "1") && <p className="form-success">
          {status.saved === "1" ? "Alterações salvas." : "Cadastro realizado."}
        </p>}

        <section className="admin-panel">
          <h2>Titulares</h2>
          <table className="admin-table">
            <thead><tr><th>Livro Caixa</th></tr></thead>
            <tbody>{titulares.rows.map(t => <tr key={t.id}><td>{t.nome}</td></tr>)}</tbody>
          </table>
          {status.sugerir_titular&&<p className="muted">Nome sugerido pela leitura do documento. Confira antes de cadastrar; o cadastro não altera automaticamente documentos já importados.</p>}
          <form action="/api/admin/titulares" method="post" className="inline-form">
            <label htmlFor="novo-titular" className="sr-only">Nome do titular</label>
            <input id="novo-titular" type="text" name="nome" placeholder="Nome do novo titular" defaultValue={status.sugerir_titular?.slice(0,120)||""} maxLength={120} required />
            <button type="submit">Adicionar titular</button>
          </form>
        </section>

        <section className="admin-panel">
          <h2>Categorias compartilhadas</h2>
          <div className="table-scroll">
            <table className="admin-table dense-table">
              <thead><tr><th>Categoria</th><th>Subcategoria</th><th></th></tr></thead>
              <tbody>{catRows.rows.map(c=><tr key={c.id}>
                <td colSpan={3}>
                  <form action="/api/admin/categorias" method="post" className="inline-form">
                    <input type="hidden" name="id" value={c.id}/>
                    <input name="nome" aria-label="Categoria" defaultValue={c.nome} required maxLength={90}/>
                    <input name="subcategoria" aria-label="Subcategoria" defaultValue={c.subcategoria} maxLength={90}/>
                    <button type="submit">Salvar</button>
                  </form>
                </td>
              </tr>)}</tbody>
            </table>
          </div>
          <form action="/api/admin/categorias" method="post" className="inline-form">
            <input name="nome" placeholder="Nova categoria" required maxLength={90}/>
            <input name="subcategoria" placeholder="Subcategoria (opcional)" maxLength={90}/>
            <button type="submit">Adicionar categoria</button>
          </form>
        </section>

        <section className="admin-panel">
          <h2>Usuários</h2>
          <form action="/api/admin/users" method="post" className="inline-form">
            <label htmlFor="new-username" className="sr-only">Nome de usuário</label>
            <input id="new-username" name="username" placeholder="Usuário (a-z, 0-9, ponto, _ ou -)" minLength={3} maxLength={32} pattern="[a-z0-9._-]{3,32}" autoComplete="off" required />
            <label htmlFor="new-password" className="sr-only">Senha do usuário</label>
            <AdminPasswordInput id="new-password" placeholder="Senha (mínimo 6 caracteres)" />
            <button type="submit">Criar usuário</button>
          </form>
          <p className="muted">Contas criadas sem acesso aos livros até que suas permissões sejam definidas abaixo. A senha salva não pode ser recuperada; você pode definir outra quando necessário.</p>
        </section>

        <section className="admin-panel">
          <h2>Permissões por titular</h2>
          {usuarios.rows.map(u => (
            <div className="user-permissions" key={u.id}>
              <div className="user-permissions-title">
                <strong>{u.username}</strong>
                {u.is_admin && <span className="mini-tag"><LockKeyhole size={12}/> Administrador</span>}
              </div>
              {!u.is_admin && (
                <form action="/api/admin/permissions" method="post">
                  <input type="hidden" name="userId" value={u.id} />
                  <div className="table-scroll">
                    <table className="admin-table permission-table">
                      <thead><tr><th>Titular</th>{actions.map(a => <th key={a.field}>{a.name}</th>)}</tr></thead>
                      <tbody>{titulares.rows.map(t => {
                        const perm = matrix.get(u.id + ":" + t.id);
                        return <tr key={t.id}>
                          <td>{t.nome}</td>
                          {actions.map(a => <td key={a.field} className="check-cell">
                            <input aria-label={a.name + " — " + t.nome}
                              type="checkbox" name={"p_" + t.id + "_" + a.field.replace("can_", "")}
                              defaultChecked={Boolean(perm?.[a.field])} />
                          </td>)}
                        </tr>;
                      })}</tbody>
                    </table>
                  </div>
                  <div className="form-actions"><button type="submit">Salvar permissões</button></div>
                </form>
              )}
              <form className="inline-form reset-form" action="/api/admin/reset-password" method="post">
                <input type="hidden" name="userId" value={u.id} />
                <label className="sr-only" htmlFor={"reset-" + u.id}>Nova senha de {u.username}</label>
                <AdminPasswordInput id={"reset-" + u.id} placeholder="Nova senha (mínimo 6 caracteres)" />
                <button type="submit">Alterar senha</button>
              </form>
            </div>
          ))}
        </section>
      </main>
    </div>
    </StandaloneWorkspace>
  );
}
