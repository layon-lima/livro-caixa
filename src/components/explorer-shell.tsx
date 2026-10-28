import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  FileSearch,
  Folder,
  FolderOpen,
  LayoutList,
  PanelRight,
} from "lucide-react";

/**
 * Estrutura visual da Camada 01: não simula operações nem cria ações fictícias.
 * Na Camada 02 a árvore será preenchida a partir dos titulares autorizados.
 */
export function ExplorerShell() {
  return (
    <div className="workspace">
      <aside className="rail" aria-label="Navegação">
        <div className="rail-mark" aria-label="Livro Caixa Inteligente">LC</div>
        <div className="rail-item rail-item-active" aria-label="Livros Caixa">
          <BookOpen size={19} strokeWidth={1.8} aria-hidden="true" />
          <span>Livros</span>
        </div>
      </aside>

      <aside className="folder-pane" aria-label="Pastas e titulares">
        <div className="pane-heading">
          <span>EXPLORADOR</span>
        </div>
        <div className="folder-root" aria-current="page">
          <ChevronDown size={14} className="tree-chevron" />
          <FolderOpen size={16} className="folder-icon" />
          <span>Livros Caixa</span>
        </div>
        <p className="tree-empty">Nenhum titular cadastrado</p>
      </aside>

      <main className="content-pane">
        <header className="content-header">
          <div className="crumb">
            <BookOpen size={17} strokeWidth={1.8} />
            <ChevronRight size={14} className="crumb-chevron" />
            <strong>Livros Caixa</strong>
          </div>
          <span className="content-header-caption">Organização documental</span>
        </header>

        <section className="file-list" aria-label="Operações">
          <div className="list-titlebar">
            <div>
              <h1>Livros Caixa</h1>
              <p>Organização por titular, período e categoria</p>
            </div>
          </div>

          <div className="file-columns" aria-hidden="true">
            <div className="col-main">Nome da operação</div>
            <div className="col-category">Categoria</div>
            <div className="col-period">Competência</div>
            <div className="col-docs">Documentos</div>
          </div>

          <div className="file-empty">
            <div className="empty-icon"><Folder size={28} strokeWidth={1.3} /></div>
            <strong>Nenhuma operação cadastrada</strong>
            <span>Os livros e documentos aparecerão aqui quando forem cadastrados.</span>
          </div>
        </section>

        <footer className="statusbar">
          <span><LayoutList size={13} /> 0 operações</span>
          <span>Livro Caixa Inteligente</span>
        </footer>
      </main>

      <aside className="preview-pane" aria-label="Visualização de documentos">
        <div className="preview-title">
          <span><PanelRight size={15} /> Visualização</span>
        </div>
        <div className="preview-empty">
          <FileSearch size={33} strokeWidth={1.3} />
          <strong>Nenhum documento selecionado</strong>
          <p>Os documentos vinculados à operação serão exibidos neste painel.</p>
        </div>
      </aside>
    </div>
  );
}
