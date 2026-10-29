import Link from "next/link";
import {
  BookOpen, ChevronDown, ChevronRight, Folder, FolderOpen,
  LayoutList, LogOut, Settings2, Trash2, Table2,
} from "lucide-react";
import type { AuthUser } from "@/lib/auth";

export type Titular = { id: string; nome: string };
type Props = {
  user: AuthUser; titulares: Titular[]; selected?: Titular;
  children?: React.ReactNode; folderContent?: React.ReactNode;
  operationCount?: number; tabBookId?:string; activeTab?:"explorador"|"planilha";
  pageTitle?:string; activeSection?:"livros"|"admin"|"lixeira";
};

export function ExplorerShell({ user, titulares, selected, children, folderContent, operationCount, tabBookId, activeTab="explorador", pageTitle, activeSection="livros" }: Props) {
  return (
    <div className="workspace">
      <aside className="rail" aria-label="Navegação">
        <div className="rail-mark" aria-label="Livro Caixa Inteligente">LC</div>
        <Link className={"rail-item"+(activeSection==="livros"?" rail-item-active":"")} href="/" aria-label="Livros Caixa">
          <BookOpen size={19} strokeWidth={1.8} aria-hidden="true" /><span>Livros</span>
        </Link>
        <Link className={"rail-item"+(activeSection==="lixeira"?" rail-item-active":"")} href="/lixeira" aria-label="Lixeira">
          <Trash2 size={19} strokeWidth={1.8}/><span>Lixeira</span>
        </Link>
        {user.isAdmin&&<Link className={"rail-item"+(activeSection==="admin"?" rail-item-active":"")} href="/admin" aria-label="Administração">
          <Settings2 size={19} strokeWidth={1.8}/><span>Admin</span>
        </Link>}
      </aside>

      <aside className="folder-pane" aria-label="Pastas e titulares">
        <div className="pane-heading"><span>EXPLORADOR</span></div>
        <Link className="folder-root" href="/">
          <ChevronDown size={14} className="tree-chevron" />
          <FolderOpen size={16} className="folder-icon" />
          <span>Livros Caixa</span>
        </Link>
        {titulares.map(t => (
          <Link key={t.id} className={"tree-link" + (selected?.id === t.id ? " tree-link-selected" : "")}
            href={"/livros/" + t.id}>
            <Folder size={15} className="folder-icon" /><span>{t.nome}</span>
          </Link>
        ))}
        {titulares.length === 0 && <p className="tree-empty">Nenhum livro autorizado</p>}
        <div className="explorer-divider" role="separator" aria-label="Outras pastas"/>
        {folderContent}
      </aside>

      <main className="content-pane">
        <header className="content-header">
          <div className="crumb">
            <BookOpen size={17} strokeWidth={1.8} />
            <ChevronRight size={14} className="crumb-chevron" />
            {selected ? (
              <><Link href="/">Livros Caixa</Link><ChevronRight size={14} className="crumb-chevron" />
                <strong>{selected.nome}</strong></>
            ) : <strong>{pageTitle||"Livros Caixa"}</strong>}
          </div>
          <div className="top-actions">
            <span className="content-header-caption">{user.username}</span>
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="logout-button" title="Sair do sistema"><LogOut size={15} /> Sair</button>
            </form>
          </div>
        </header>

        <section className="file-list" aria-label="Livros e operações">
          <div className="list-titlebar">
            <div><h1>{selected ? selected.nome : pageTitle||"Livros Caixa"}</h1>
              <p>{selected ? "Operações e documentos" : pageTitle?"Área de trabalho":"Selecione o titular para abrir seu livro"}</p></div>
          </div>

          {tabBookId&&<nav className="book-subtabs" aria-label="Visualização do livro">
            <Link className={activeTab==="explorador"?"active":""}
              href={"/livros/"+tabBookId}><Folder size={15}/> Explorador</Link>
            <Link className={activeTab==="planilha"?"active":""}
              href={"/livros/"+tabBookId+"?aba=planilha"}><Table2 size={15}/> Planilha</Link>
          </nav>}
          {children ? children : selected ? <>
            <div className="file-columns" aria-hidden="true">
              <div className="col-main">Nome da operação</div><div className="col-category">Categoria</div>
              <div className="col-period">Competência</div><div className="col-docs">Documentos</div>
            </div>
            <div className="file-empty">
              <div className="empty-icon"><Folder size={28} strokeWidth={1.3} /></div>
              <strong>Nenhuma operação cadastrada</strong>
              <span>As operações aparecerão aqui depois da implementação da importação.</span>
            </div>
          </> : <div className="titular-list">
            {titulares.map(t => <Link className="titular-row" key={t.id} href={"/livros/" + t.id}>
              <Folder size={16} className="folder-icon" /><span>{t.nome}</span><ChevronRight size={15} /></Link>)}
            {titulares.length === 0 && <p className="muted">Nenhum livro disponível para este usuário.</p>}
          </div>}
        </section>
        <footer className="statusbar">
          <span><LayoutList size={13} /> {selected ? (activeTab==="planilha"?"Planilha de saídas":(operationCount ?? 0) + " operações") : titulares.length + " livros"}</span>
          <span>Livro Caixa Inteligente</span>
        </footer>
      </main>

    </div>
  );
}
