import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { categorias, titularesPermitidos } from "@/lib/document-data";
import { ArrowLeft, PenLine } from "lucide-react";
export const dynamic="force-dynamic";
export default async function Manual({searchParams}:{searchParams:Promise<{titular?:string}>}){
  const user=await requireUser();
  const [books,cats,query]=await Promise.all([titularesPermitidos(user,"edit"),categorias(),searchParams]);
  const selected=books.find(t=>t.id===query.titular)||books[0];
  return <div className="work-page">
    <header className="work-bar"><Link href="/"><ArrowLeft size={16}/> Livros Caixa</Link>
      <strong><PenLine size={16}/> Lançamento manual</strong></header>
    <main className="work-main narrow-work">
      <h1 className="work-heading">Novo lançamento</h1>
      {!selected?<p className="form-error">Você não possui permissão para criar lançamentos.</p>:
      <form className="review-form" action="/api/operacoes" method="post">
        <div className="form-inline-two">
          <label>Titular<select name="titularId" defaultValue={selected.id}>
            {books.map(t=><option key={t.id} value={t.id}>{t.nome}</option>)}
          </select></label>
          <label>Competência<input type="month" name="competencia" defaultValue={new Date().toISOString().slice(0,7)} required/></label>
        </div>
        <label>Título<input name="titulo" required maxLength={170} placeholder="Descrição objetiva da operação"/></label>
        <div className="form-inline-two">
          <label>Categoria<select name="categoriaId"><option value="">Sem categoria</option>
            {cats.map(c=><option value={c.id} key={c.id}>{c.nome}{c.subcategoria?" → "+c.subcategoria:""}</option>)}
          </select></label>
          <label>Tipo<select name="tipo"><option value="despesa">Despesa</option><option value="receita">Receita</option><option value="outro">Outro</option></select></label>
        </div>
        <div className="form-inline-two">
          <label>Fornecedor / contraparte<input name="contraparte"/></label>
          <label>Valor (informativo)<input name="valor" inputMode="decimal" placeholder="Opcional"/></label>
        </div>
        <label>Descrição<textarea name="descricao" rows={3}/></label>
        <button type="submit" className="primary-btn">Salvar lançamento</button>
      </form>}
      <p className="muted">Você pode vincular notas, boletos e comprovantes a este lançamento posteriormente, durante a conferência.</p>
    </main>
  </div>;
}
