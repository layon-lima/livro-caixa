import Link from "next/link";
import {
  BookOpen, ChevronRight, Folder,
  LayoutList, LogOut, Settings2, Trash2,
} from "lucide-react";
import type { AuthUser } from "@/lib/auth";
import { NavigationArrows } from "@/components/navigation-arrows";

export type Titular = { id: string; nome: string };
type Props = {
  user: AuthUser; titulares: Titular[]; selected?: Titular;
  children?: React.ReactNode;
  pageTitle?:string; activeSection?:"livros"|"admin"|"lixeira"; focusMode?:boolean;
};

export function ExplorerShell({ user, titulares, selected, children, pageTitle, activeSection="livros", focusMode=false }: Props) {
  return (
    <div className={"workspace"+(focusMode?" workspace-focus":"")}>
      <aside className="rail" aria-label="Navegação">
        <div className="rail-mark" aria-label="Livro Caixa Inteligente">LC</div>
        <Link className={"rail-item"+(activeSection==="livros"?" rail-item-active":"")} href="/" aria-label="Livros Caixa">
          <BookOpen size={19} strokeWidth={1.8} aria-hidden="true" /><span>Livros</span>
        </Link>
        {user.isAdmin&&<Link className={"rail-item"+(activeSection==="lixeira"?" rail-item-active":"")} href="/lixeira" aria-label="Lixeira">
          <Trash2 size={19} strokeWidth={1.8}/><span>Lixeira</span>
        </Link>}
        {user.isAdmin&&<Link className={"rail-item"+(activeSection==="admin"?" rail-item-active":"")} href="/admin" aria-label="Administração">
          <Settings2 size={19} strokeWidth={1.8}/><span>Admin</span>
        </Link>}
      </aside>


      <main className="content-pane">
        <header className="content-header">
          <NavigationArrows/>
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

        <section className="file-list" aria-label="Livros e lançamentos">
          <div className="list-titlebar">
            <div><h1>{selected ? selected.nome : pageTitle||"Livros Caixa"}</h1>
              <p>{selected ? "Lançamentos e documentos" : pageTitle?"Área de trabalho":"Selecione o titular para abrir seu livro"}</p></div>
          </div>

          {children ? children : selected ? <>
            <div className="file-columns" aria-hidden="true">
              <div className="col-main">Descrição do lançamento</div><div className="col-category">Categoria</div>
              <div className="col-period">Competência</div><div className="col-docs">Documentos</div>
            </div>
            <div className="file-empty">
              <div className="empty-icon"><Folder size={28} strokeWidth={1.3} /></div>
              <strong>Nenhum lançamento cadastrado</strong>
              <span>Os lançamentos aparecerão após a aprovação de documentos.</span>
            </div>
          </> : <nav className="home-books-grid" aria-label="Abrir livro caixa">
            {titulares.map(t => <Link className="home-book-tile" key={t.id} href={"/livros/" + t.id}
              aria-label={"Abrir livro caixa de "+t.nome}>
              <span className="home-book-icon" aria-hidden="true">
                <Folder size={44} strokeWidth={1.4} fill="#f5d789"/>
              </span>
              <span className="home-book-label">{t.nome}</span>
              <span className="home-book-hint">Abrir livro <ChevronRight size={13} strokeWidth={1.7}/></span>
            </Link>)}
            {titulares.length === 0 && <p className="muted">Nenhum livro disponível para este usuário.</p>}
          </nav>}
        </section>
        <footer className="statusbar">
          <span><LayoutList size={13} /> {selected ? "Planilha de saídas" : titulares.length + " livros"}</span>
          <span>Livro Caixa Inteligente</span>
        </footer>
      </main>

    </div>
  );
}
