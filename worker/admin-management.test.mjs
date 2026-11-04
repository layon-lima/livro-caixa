import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const root=new URL("../",import.meta.url);
const read=path=>readFile(new URL(path,root),"utf8");

test("Administração tem ações de criar, editar, excluir e restaurar nas três áreas",async()=>{
  for(const path of ["categorias","users","titulares"]){
    const content=await read("src/app/api/admin/"+path+"/route.ts");
    for(const action of ["criar","editar","excluir","restaurar"])
      assert.ok(content.includes('"'+action+'"'),path+" / "+action);
    assert.match(content,/sameOriginPost/);
    assert.match(content,/isAdmin/);
  }
});
test("Exclusão arquiva sem apagar documentos, usuários ou titulares",async()=>{
  const owners=await read("src/app/api/admin/titulares/route.ts");
  const users=await read("src/app/api/admin/users/route.ts");
  const categories=await read("src/app/api/admin/categorias/route.ts");
  assert.match(owners,/UPDATE titulares SET ativo=/);
  assert.match(users,/UPDATE users SET is_active=FALSE/);
  assert.match(categories,/UPDATE categorias SET ativa=/);
  assert.doesNotMatch(owners,/DELETE FROM titulares/);
  assert.doesNotMatch(users,/DELETE FROM users/);
  assert.doesNotMatch(categories,/DELETE FROM categorias/);
});
test("Remover usuários encerra as sessões e preserva o próprio administrador",async()=>{
  const content=await read("src/app/api/admin/users/route.ts");
  assert.match(content,/target.is_admin\|\|id===admin.id/);
  assert.match(content,/DELETE FROM user_sessions WHERE user_id/);
});
test("Titulares arquivados somem dos seletores e as permissões antigas são preservadas",async()=>{
  const migration=await read("db/migrations/017_admin_management.sql");
  const data=await read("src/lib/document-data.ts");
  const home=await read("src/app/page.tsx");
  const perms=await read("src/app/api/admin/permissions/route.ts");
  assert.match(migration,/ADD COLUMN IF NOT EXISTS ativo BOOLEAN/);
  assert.match(data,/t.ativo=TRUE/);
  assert.match(home,/t.ativo=TRUE/);
  assert.match(perms,/titular_id IN \(SELECT id FROM titulares WHERE ativo=TRUE\)/);
});
test("Nova UI possui abas, cadastro fácil e edição de permissões",async()=>{
  const s=await read("src/components/admin-console.tsx");
  for(const phrase of ["Categorias","Usuários","Titulares","Novo ","Arquivados",
    "Marcar tudo","Salvar permissões","Excluir ","Restaurar"])
    assert.ok(s.includes(phrase),phrase);
  assert.match(s,/role="dialog"/);
  assert.match(s,/type="submit"/);
});
