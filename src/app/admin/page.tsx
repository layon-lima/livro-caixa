import {StandaloneWorkspace} from "@/components/standalone-workspace";
import {requireAdmin} from "@/lib/auth";
import {getDatabase} from "@/lib/database";
import {AdminConsole,type AdminCategory,type AdminOwner,type AdminUser,type AdminPermission} from "@/components/admin-console";
export const dynamic="force-dynamic";

export default async function Admin({searchParams}:{
  searchParams:Promise<{tab?:string;created?:string;saved?:string;error?:string;sugerir_titular?:string}>
}){
  await requireAdmin();
  const db=getDatabase();
  const [cats,users,owners,perms,query]=await Promise.all([
    db.query<AdminCategory>(
      "SELECT c.id::text,c.nome,c.ativa,"+
      "(SELECT COUNT(*)::int FROM operacoes o WHERE o.categoria_id=c.id) AS operacoes "+
      "FROM categorias c WHERE c.subcategoria='' ORDER BY c.ativa DESC,c.nome"),
    db.query<AdminUser>(
      "SELECT u.id::text,u.username,u.is_admin,u.is_active,"+
      "(SELECT COUNT(*)::int FROM user_titular_permissions p WHERE p.user_id=u.id) AS livros "+
      "FROM users u ORDER BY u.is_active DESC,u.is_admin DESC,u.username"),
    db.query<AdminOwner>(
      "SELECT t.id::text,t.nome,t.ativo,"+
      "(SELECT COUNT(*)::int FROM operacoes o WHERE o.titular_id=t.id) AS operacoes,"+
      "(SELECT COUNT(*)::int FROM arquivos a WHERE a.titular_envio_id=t.id) AS arquivos "+
      "FROM titulares t ORDER BY t.ativo DESC,t.nome"),
    db.query<AdminPermission>(
      "SELECT user_id::text,titular_id::text,can_view,can_import,can_approve,can_edit,can_delete "+
      "FROM user_titular_permissions"),
    searchParams
  ]);
  const tab=query.tab==="usuarios"||query.tab==="titulares"?query.tab:"categorias";
  return <StandaloneWorkspace title="Administração" section="admin">
    <AdminConsole categories={cats.rows} users={users.rows} owners={owners.rows}
      permissions={perms.rows} initialTab={tab}
      message={query.created==="1"?"created":query.saved==="1"?"saved":""}
      error={query.error||""} suggestion={query.sugerir_titular||""}/>
  </StandaloneWorkspace>;
}
