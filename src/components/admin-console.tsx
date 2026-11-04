"use client";

import {useMemo,useState} from "react";
import {
  Archive,BookOpen,Check,FolderClosed,KeyRound,
  LockKeyhole,Pencil,Plus,RotateCcw,Search,Settings2,ShieldCheck,
  Tags,Trash2,Users,X
} from "lucide-react";
import {AdminPasswordInput} from "@/components/admin-password-input";

export type AdminCategory={id:string;nome:string;ativa:boolean;operacoes:number};
export type AdminTag={id:string;nome:string;ativa:boolean;usos:number};
export type AdminOwner={id:string;nome:string;ativo:boolean;operacoes:number;arquivos:number};
export type AdminUser={id:string;username:string;is_admin:boolean;is_active:boolean;livros:number};
export type AdminPermission={
  user_id:string;titular_id:string;can_view:boolean;can_import:boolean;
  can_approve:boolean;can_edit:boolean;can_delete:boolean;
};
type Tab="categorias"|"usuarios"|"titulares"|"tags";
type Target={id:string;name:string;kind:"category"|"user"|"owner"|"tag";active:boolean};
type Modal={kind:"create"|"edit"|"delete"|"reset";target?:Target}|null;
const routes:Record<Tab,string>={
  categorias:"/api/admin/categorias",usuarios:"/api/admin/users",
  titulares:"/api/admin/titulares",tags:"/api/admin/tags"
};
const fields=[
  {key:"view",label:"Consultar"},
  {key:"import",label:"Importar"},
  {key:"approve",label:"Aprovar"},
  {key:"edit",label:"Editar"},
  {key:"delete",label:"Excluir"}
] as const;
const fold=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const errLabels:Record<string,string>={
  dados:"Preencha os campos com informações válidas.",
  duplicado:"Já existe um cadastro com esse nome.",
  arquivada:"Esse nome já existe nos arquivados. Use “Ver arquivados” para restaurá-lo.",
  senha:"A senha precisa ter pelo menos 6 caracteres.",
  administrador:"Contas administradoras não podem ser desativadas por esta tela.",
  processamento:"Não foi possível concluir. Confira os dados e tente novamente."
};

export function AdminConsole({categories,users,owners,tags,permissions,initialTab,message,error,suggestion}:{
 categories:AdminCategory[];users:AdminUser[];owners:AdminOwner[];tags:AdminTag[];
 permissions:AdminPermission[];initialTab:Tab;message:string;error:string;suggestion:string;
}){
  const [tab,setTab]=useState<Tab>(suggestion?"titulares":initialTab);
  const [search,setSearch]=useState("");
  const [archived,setArchived]=useState(false);
  const [modal,setModal]=useState<Modal>(null);
  const [permissionUser,setPermissionUser]=useState<AdminUser|null>(null);
  const [access,setAccess]=useState<Record<string,boolean>>({});
  const allCounts={
    categorias:categories.filter(x=>x.ativa).length,
    usuarios:users.filter(x=>x.is_active).length,
    titulares:owners.filter(x=>x.ativo).length,
    tags:tags.filter(x=>x.ativa).length
  };
  const rows=useMemo(()=>{
    const list=tab==="categorias"?categories:tab==="usuarios"?users:tab==="titulares"?owners:tags;
    const term=fold(search.trim());
    return list.filter(x=>{
      const active="ativa" in x?x.ativa:"is_active" in x?x.is_active:x.ativo;
      const name="nome" in x?x.nome:x.username;
      return active!==archived&&(!term||fold(name).includes(term));
    });
  },[tab,search,archived,categories,users,owners,tags]);
  const title=tab==="categorias"?"Categorias":tab==="usuarios"?"Usuários":tab==="titulares"?"Titulares":"Tags";
  const single=tab==="categorias"?"categoria":tab==="usuarios"?"usuário":tab==="titulares"?"titular":"tag";
  const selected=modal?.target;
  function switchTab(next:Tab){
    setTab(next);setSearch("");setArchived(false);setModal(null);setPermissionUser(null);
  }
  function targetFor(row:AdminCategory|AdminOwner|AdminUser|AdminTag):Target{
    return {id:row.id,name:"nome" in row?row.nome:row.username,
      kind:tab==="categorias"?"category":tab==="usuarios"?"user":tab==="titulares"?"owner":"tag",
      active:"ativa" in row?row.ativa:"is_active" in row?row.is_active:row.ativo};
  }
  function beginPermissions(user:AdminUser){
    const next:Record<string,boolean>={};
    for(const owner of owners.filter(x=>x.ativo)){
      const p=permissions.find(x=>x.user_id===user.id&&x.titular_id===owner.id);
      for(const {key} of fields)next[owner.id+"_"+key]=Boolean(p?.[("can_"+key) as keyof AdminPermission]);
    }
    setAccess(next);setPermissionUser(user);
  }
  const cols=owners.filter(x=>x.ativo);
  return <div className="admin-v2">
    <div className="admin-v2-heading">
      <div className="admin-v2-heading-text">
        <div className="admin-v2-icon"><Settings2 size={21}/></div>
        <div><h1>Administração</h1>
          <p>Cadastros e acessos do Livro Caixa, em um só lugar.</p>
        </div>
      </div>
      <div className="admin-v2-total">{allCounts.categorias+allCounts.usuarios+allCounts.titulares+allCounts.tags} cadastros ativos</div>
    </div>
    {(message||error)&&<div role={error?"alert":"status"} className={"admin-v2-alert "+(error?"admin-v2-error":"admin-v2-ok")}>
      {error?errLabels[error]||"Verifique o cadastro e tente novamente.":
        message==="created"?"Cadastro criado com sucesso.":"Alterações salvas com sucesso."}
    </div>}
    <div className="admin-v2-tabs" role="tablist" aria-label="Área administrativa">
      <button role="tab" aria-selected={tab==="categorias"} type="button" className={tab==="categorias"?"active":""}
        onClick={()=>switchTab("categorias")}><Tags size={17}/> Categorias <span>{allCounts.categorias}</span></button>
      <button role="tab" aria-selected={tab==="usuarios"} type="button" className={tab==="usuarios"?"active":""}
        onClick={()=>switchTab("usuarios")}><Users size={17}/> Usuários <span>{allCounts.usuarios}</span></button>
      <button role="tab" aria-selected={tab==="tags"} type="button" className={tab==="tags"?"active":""}
        onClick={()=>switchTab("tags")}><Tags size={17}/> Tags <span>{allCounts.tags}</span></button>
      <button role="tab" aria-selected={tab==="titulares"} type="button" className={tab==="titulares"?"active":""}
        onClick={()=>switchTab("titulares")}><BookOpen size={17}/> Titulares <span>{allCounts.titulares}</span></button>
    </div>
    <section className="admin-v2-panel" aria-label={"Gerenciar "+title}>
      <div className="admin-v2-toolbar">
        <div className="admin-v2-section-title">
          <h2>{title}</h2>
          <p>{tab==="categorias"?"Categorias compartilhadas entre todos os livros":
            tab==="usuarios"?"Controle de contas e permissões de acesso":
            tab==="tags"?"Etiquetas livres para combinar em qualquer lançamento":
            "Livros e titulares cadastrados no sistema"}</p>
        </div>
        <div className="admin-v2-actions">
          <label className="admin-v2-search">
            <Search size={16}/>
            <input aria-label={"Pesquisar "+title} value={search}
              onChange={e=>setSearch(e.target.value)} placeholder={"Pesquisar "+single+"…"}/>
          </label>
          <button type="button" className={"admin-v2-archive-toggle"+(archived?" active":"")}
            onClick={()=>setArchived(v=>!v)} aria-pressed={archived}>
            {archived?<RotateCcw size={15}/>:<Archive size={15}/>}
            {archived?"Ver ativos":"Arquivados"}
          </button>
          <button type="button" className="admin-v2-new" onClick={()=>setModal({kind:"create"})}>
            <Plus size={16}/> Novo {single}
          </button>
        </div>
      </div>
      <div className="admin-v2-list">
        <div className="admin-v2-list-head">
          <span>{archived?"Arquivados":"Ativos"} ({rows.length})</span>
          <span>Ações</span>
        </div>
        {rows.map(row=>{
          const target=targetFor(row);
          const isAdmin=tab==="usuarios"&&(row as AdminUser).is_admin;
          const meta=tab==="tags"?(row as AdminTag).usos+" lançamento(s) com esta tag":tab==="categorias"?
            (row as AdminCategory).operacoes+" lançamento(s) vinculado(s)":
            tab==="usuarios"?
              (isAdmin?"Administrador":(row as AdminUser).livros+" livro(s) com permissões"):
              (row as AdminOwner).operacoes+" lançamento(s) · "+(row as AdminOwner).arquivos+" arquivo(s)";
          return <div className="admin-v2-item" key={tab+"-"+row.id}>
            <div className="admin-v2-item-icon">
              {tab==="tags"?<Tags size={18}/>:tab==="categorias"?<FolderClosed size={18}/>:
                tab==="usuarios"?<Users size={18}/>:<BookOpen size={18}/>}
            </div>
            <div className="admin-v2-item-info">
              <strong title={target.name}>{target.name}</strong>
              <small>{meta}</small>
            </div>
            {isAdmin&&<span className="admin-v2-mini-tag"><LockKeyhole size={12}/> Admin</span>}
            <div className="admin-v2-item-actions">
              {!archived&&tab==="usuarios"&&!isAdmin&&
                <button type="button" title="Definir permissões" onClick={()=>beginPermissions(row as AdminUser)}>
                  <ShieldCheck size={16}/><span>Permissões</span>
                </button>}
              {!archived&&tab==="usuarios"&&
                <button type="button" title="Alterar senha" onClick={()=>setModal({kind:"reset",target})}>
                  <KeyRound size={16}/><span>Senha</span>
                </button>}
              {!archived&&<button type="button" title="Editar" onClick={()=>setModal({kind:"edit",target})}>
                <Pencil size={15}/><span>Editar</span>
              </button>}
              {archived?
                <form action={routes[tab]} method="post">
                  <input type="hidden" name="acao" value="restaurar"/>
                  <input type="hidden" name="id" value={target.id}/>
                  <button type="submit" className="restore"><RotateCcw size={15}/> Restaurar</button>
                </form>:
                <button type="button" className="danger" disabled={isAdmin}
                  title={isAdmin?"Conta administradora protegida":"Excluir"}
                  onClick={()=>setModal({kind:"delete",target})}>
                  <Trash2 size={15}/><span>Excluir</span>
                </button>}
            </div>
          </div>;
        })}
        {!rows.length&&<div className="admin-v2-empty">
          <FolderClosed size={27}/>
          <strong>{archived?"Nenhum cadastro arquivado.":"Nenhum cadastro encontrado."}</strong>
          <span>{search?"Altere a pesquisa para encontrar outro registro.":
            archived?"Os cadastros excluídos aparecerão aqui para restauração.":
            "Use o botão Novo para criar o primeiro cadastro."}</span>
        </div>}
      </div>
      <p className="admin-v2-footnote">
        <ShieldCheck size={14}/> Excluir arquiva o cadastro e preserva documentos, operações e histórico. É possível restaurar em “Arquivados”.
      </p>
    </section>

    {modal&&<div className="admin-v2-overlay" role="presentation">
      <div className="admin-v2-dialog" role="dialog" aria-modal="true"
        aria-label={modal.kind==="delete"?"Confirmar exclusão":modal.kind==="reset"?"Alterar senha":"Cadastro"}>
        <div className="admin-v2-dialog-header">
          <div>
            <h2>{modal.kind==="create"?"Novo "+single:
              modal.kind==="edit"?"Editar "+single:
              modal.kind==="reset"?"Alterar senha":"Excluir "+single+"?"}</h2>
            <p>{modal.kind==="delete"?
              "O cadastro será arquivado, sem apagar documentos ou lançamentos.":
              modal.kind==="reset"?"A nova senha encerra as sessões atuais desse usuário.":
              "Preencha os dados abaixo e salve para continuar."}</p>
          </div>
          <button type="button" className="admin-v2-close" aria-label="Fechar"
            onClick={()=>setModal(null)}><X size={19}/></button>
        </div>
        {modal.kind==="delete"&&selected?
          <form action={routes[tab]} method="post" className="admin-v2-dialog-body">
            <input type="hidden" name="acao" value="excluir"/>
            <input type="hidden" name="id" value={selected.id}/>
            <div className="admin-v2-confirm"><Trash2 size={19}/>
              <span>Excluir <strong>{selected.name}</strong> da lista ativa?</span>
            </div>
            <div className="admin-v2-dialog-footer">
              <button type="button" className="admin-v2-cancel" onClick={()=>setModal(null)}>Cancelar</button>
              <button type="submit" className="admin-v2-danger-btn">Sim, excluir</button>
            </div>
          </form>:
          modal.kind==="reset"&&selected?
          <form action="/api/admin/reset-password" method="post" className="admin-v2-dialog-body">
            <input type="hidden" name="userId" value={selected.id}/>
            <p className="admin-v2-subject">{selected.name}</p>
            <label>Nova senha</label>
            <AdminPasswordInput id="admin-reset-password" placeholder="Mínimo de 6 caracteres"/>
            <div className="admin-v2-dialog-footer">
              <button type="button" className="admin-v2-cancel" onClick={()=>setModal(null)}>Cancelar</button>
              <button type="submit" className="admin-v2-new">Salvar senha</button>
            </div>
          </form>:
          <form action={routes[tab]} method="post" className="admin-v2-dialog-body">
            <input type="hidden" name="acao" value={modal.kind==="edit"?"editar":"criar"}/>
            {selected&&<input type="hidden" name="id" value={selected.id}/>}
            {tab==="usuarios"?<>
              <label htmlFor="admin-username">Nome de usuário</label>
              <input id="admin-username" name="username" defaultValue={selected?.name||""}
                pattern="[a-z0-9._-]{3,32}" minLength={3} maxLength={32} autoComplete="off"
                placeholder="Ex.: joao.silva" required/>
              {modal.kind==="create"&&<>
                <label>Senha inicial</label>
                <AdminPasswordInput id="admin-new-password" placeholder="Mínimo de 6 caracteres"/>
                <p className="admin-v2-hint">Depois de criar, defina a quais titulares o usuário pode acessar em “Permissões”.</p>
              </>}
            </>:<>
              <label htmlFor="admin-entity-name">Nome {tab==="categorias"?"da categoria":tab==="tags"?"da tag":"do titular"}</label>
              <input id="admin-entity-name" name="nome" autoFocus
                defaultValue={selected?.name||(tab==="titulares"?suggestion.slice(0,120):"")}
                maxLength={tab==="categorias"?80:tab==="tags"?60:120} minLength={tab==="tags"?1:3}
                placeholder={tab==="categorias"?"Ex.: Manutenção de Veículos":tab==="tags"?"Ex.: Safra 2026, Urgente, Pessoal":"Nome completo do titular"}
                required/>
            </>}
            <div className="admin-v2-dialog-footer">
              <button type="button" className="admin-v2-cancel" onClick={()=>setModal(null)}>Cancelar</button>
              <button type="submit" className="admin-v2-new">
                <Check size={15}/> {modal.kind==="edit"?"Salvar alterações":"Criar "+single}
              </button>
            </div>
          </form>}
      </div>
    </div>}

    {permissionUser&&<div className="admin-v2-overlay" role="presentation">
      <div className="admin-v2-dialog admin-v2-permissions-dialog" role="dialog" aria-modal="true"
        aria-label={"Permissões de "+permissionUser.username}>
        <div className="admin-v2-dialog-header">
          <div><h2><ShieldCheck size={18}/> Permissões de {permissionUser.username}</h2>
            <p>Defina o que esse usuário pode fazer em cada livro.</p>
          </div>
          <button type="button" className="admin-v2-close" aria-label="Fechar"
            onClick={()=>setPermissionUser(null)}><X size={19}/></button>
        </div>
        <form method="post" action="/api/admin/permissions" className="admin-v2-permission-form">
          <input type="hidden" name="userId" value={permissionUser.id}/>
          <div className="admin-v2-permission-shortcuts">
            <button type="button" onClick={()=>{
              const next:Record<string,boolean>={};
              for(const owner of cols)for(const {key} of fields)next[owner.id+"_"+key]=true;
              setAccess(next);
            }}>Marcar tudo</button>
            <button type="button" onClick={()=>setAccess({})}>Limpar</button>
          </div>
          <div className="admin-v2-permission-scroll">
            <table>
              <thead><tr><th>Livro / titular</th>
                {fields.map(f=><th key={f.key}>{f.label}</th>)}
              </tr></thead>
              <tbody>{cols.map(owner=><tr key={owner.id}>
                <td>{owner.nome}</td>
                {fields.map(f=><td key={f.key}>
                  <input aria-label={f.label+" — "+owner.nome} type="checkbox"
                    name={"p_"+owner.id+"_"+f.key}
                    checked={Boolean(access[owner.id+"_"+f.key])}
                    onChange={e=>setAccess(prev=>({...prev,
                      [owner.id+"_"+f.key]:e.target.checked}))}/>
                </td>)}
              </tr>)}</tbody>
            </table>
            {!cols.length&&<p className="admin-v2-hint">Cadastre um titular antes de definir as permissões.</p>}
          </div>
          <p className="admin-v2-hint">Permissões de importar, aprovar, editar ou excluir incluem consulta ao livro.</p>
          <div className="admin-v2-dialog-footer">
            <button type="button" className="admin-v2-cancel" onClick={()=>setPermissionUser(null)}>Cancelar</button>
            <button type="submit" className="admin-v2-new"><Check size={15}/> Salvar permissões</button>
          </div>
        </form>
      </div>
    </div>}
  </div>;
}
