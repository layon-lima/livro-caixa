import { StandaloneWorkspace } from "@/components/standalone-workspace";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { categorias, titularesPermitidos } from "@/lib/document-data";
import { ArrowLeft, PenLine } from "lucide-react";
import {SafeManualForm} from "@/components/safe-manual-form";
import {TagPicker} from "@/components/tag-picker";
import {tagsDisponiveis} from "@/lib/tags";
export const dynamic="force-dynamic";
export default async function Manual({searchParams}:{searchParams:Promise<{titular?:string;erro?:string}>}){
  const user=await requireUser();
  const [books,cats,tags,query]=await Promise.all([titularesPermitidos(user,"edit"),categorias(),tagsDisponiveis(),searchParams]);
  const selected=books.find(t=>t.id===query.titular)||books[0];
  return <StandaloneWorkspace title="Lançamento manual" section="livros"><div className="work-page">
    <header className="work-bar"><Link href="/"><ArrowLeft size={16}/> Livros Caixa</Link>
      <strong><PenLine size={16}/> Lançamento manual</strong></header>
    <main className="work-main narrow-work">
      <h1 className="work-heading">Novo lançamento</h1>
      {!selected?<p className="form-error">Você não possui permissão para criar lançamentos.</p>:
      <SafeManualForm>
        <div className="form-inline-two">
          <label>Titular<select name="titularId" defaultValue={selected.id}>
            {books.map(t=><option key={t.id} value={t.id}>{t.nome}</option>)}
          </select></label>
          <label>Competência<input type="month" name="competencia" defaultValue={new Date().toISOString().slice(0,7)} required/></label>
          <label>Data do pagamento<input type="date" name="dataPagamento"/></label>
        </div>
        <label>Título<input name="titulo" required maxLength={170} placeholder="Descrição objetiva da operação"/></label>
        <div className="form-inline-two">
          <label>Categoria<select name="categoriaId"><option value="">Sem categoria</option>
            {cats.map(c=><option value={c.id} key={c.id}>{c.nome}</option>)}
          </select></label>
          <label>Tipo<select name="tipo"><option value="despesa">Despesa</option><option value="outro">Outro</option></select></label>
        </div>
        <div className="form-inline-two">
          <label>Fornecedor / contraparte<input name="contraparte"/></label>
          <label>Valor (informativo)<input name="valor" inputMode="decimal" placeholder="Opcional"/></label>
        </div>
        <label>Referência da transação (opcional)
          <input name="referencia" maxLength={100} placeholder="Ex.: identificador Pix"/>
        </label>
        <label>Descrição<textarea name="descricao" rows={3}/></label>
        <TagPicker tags={tags}/>
      </SafeManualForm>}
      {query.erro&&<p className="form-error" role="alert">{
        query.erro==="duplicado"?"Transação já registrada. O lançamento foi bloqueado.":
        query.erro==="semelhante"?"Já existe um lançamento semelhante. Confira antes de tentar novamente.":
        "Não foi possível salvar."
      }</p>}
    </main>
  </div></StandaloneWorkspace>;
}
