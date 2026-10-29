import Link from "next/link";
import { ChevronRight, Folder } from "lucide-react";
import { OperationRows, type OperationEntry, type AttachedDocument } from "@/components/operation-rows";
import {
  categoryName,explorerHref,monthTitle,type MonthGroup,type CategoryGroup,type RecipientGroup
} from "@/lib/explorer-grouping";

type Book={id:string;nome:string};
export function GroupedExplorer({
  bookId,months,activeMonth,activeCategory,activeRecipient,search,operations,documents,
  books,canEdit,canDelete
}:{
  bookId:string;months:MonthGroup[];activeMonth:MonthGroup|null;
  activeCategory:CategoryGroup|null;activeRecipient:RecipientGroup|null;
  search:string;operations:OperationEntry[];documents:AttachedDocument[];
  books:Book[];canEdit:boolean;canDelete:boolean;
}){
  const browsingOperations=Boolean(search||activeRecipient);
  const entries:{key:string;label:string;kind:string;period:string;count:number;href:string}[]=
    browsingOperations?[]:
    !activeMonth?months.map(m=>({key:m.mes,label:monthTitle(m.mes),kind:"Mês",
      period:m.mes,count:m.count,href:explorerHref(bookId,{mes:m.mes})})):
    !activeCategory?activeMonth.categories.map(c=>({
      key:c.key,label:categoryName(c.name,c.subcategoria),kind:"Categoria",
      period:activeMonth.mes,count:c.count,
      href:explorerHref(bookId,{mes:activeMonth.mes,categoria:c.ids[0]||"sem"})
    })):
    activeCategory.recipients.map(rec=>({
      key:rec.key,label:rec.name,kind:"Recebedor",period:activeMonth.mes,count:rec.count,
      href:explorerHref(bookId,{
        mes:activeMonth.mes,categoria:activeCategory.ids[0]||"sem",recebedor:rec.key
      })
    }));
  return <>
    <nav className="explorer-breadcrumbs" aria-label="Caminho das pastas">
      <Link href={explorerHref(bookId)}>Todos os meses</Link>
      {activeMonth&&<><ChevronRight size={13}/>
        <Link href={explorerHref(bookId,{mes:activeMonth.mes})}>{monthTitle(activeMonth.mes)}</Link>
      </>}
      {activeMonth&&activeCategory&&<><ChevronRight size={13}/>
        <Link href={explorerHref(bookId,{mes:activeMonth.mes,
          categoria:activeCategory.ids[0]||"sem"})}>
          {categoryName(activeCategory.name,activeCategory.subcategoria)}
        </Link>
      </>}
      {activeRecipient&&<><ChevronRight size={13}/><strong>{activeRecipient.name}</strong></>}
      {search&&<><ChevronRight size={13}/><strong>Resultados da pesquisa</strong></>}
    </nav>
    {browsingOperations?
      <OperationRows operations={operations} documents={documents} books={books}
        canEdit={canEdit} canDelete={canDelete} bookId={bookId}/>:
      <div className="operation-scroll explorer-folders" aria-label="Pastas organizadas por mês, categoria e recebedor">
        {entries.map(entry=><Link key={entry.key} href={entry.href}
          className="operation-row operation-popup-row explorer-folder-row"
          title={"Abrir pasta "+entry.label}>
          <span className="operation-name"><Folder size={16} className="folder-icon"/>
            <strong>{entry.label}</strong></span>
          <span>{entry.kind}</span>
          <span>{entry.period}</span>
          <span>{entry.count} {entry.count===1?"lançamento":"lançamentos"}</span>
        </Link>)}
        {entries.length===0&&<p className="empty-info">Nenhuma pasta nesta seleção.</p>}
      </div>}
  </>;
}
