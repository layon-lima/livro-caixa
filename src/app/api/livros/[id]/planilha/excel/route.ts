import ExcelJS from "exceljs";
import { currentUser,canAccessTitular } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import { parseExpenseFilters,expenseExport,type ExpenseRow } from "@/lib/expense-report";
import { safeId } from "@/lib/document-data";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const currencyFmt='"R$" #,##0.00;[Red]("R$" #,##0.00)';
function cents(value:string|null){
  const n=Number(value||"0");
  return Number.isFinite(n)?Math.round(n*100):0;
}
function safeText(value:string|null|undefined){
  const str=(value||"").slice(0,32000);
  // Evita interpretações perigosas quando uma planilha for reimportada.
  return /^[=+\-@\t\r]/.test(str)?"'"+str:str;
}
function money(value:number){return value/100;}
const months=["janeiro","fevereiro","março","abril","maio","junho","julho",
  "agosto","setembro","outubro","novembro","dezembro"];
function label(m:string){
  const [y,mm]=m.split("-");
  return months[Number(mm)-1]+" de "+y;
}

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await currentUser();
  if(!user)return new Response("Não autenticado",{status:401});
  const id=safeId((await params).id);
  if(!id||!await canAccessTitular(user,id,"view"))
    return new Response("Acesso negado",{status:403});
  try{
    const db=getDatabase();
    const title=await db.query<{nome:string}>("SELECT nome FROM titulares WHERE id=$1",[id]);
    if(!title.rows[0])return new Response("Titular não encontrado",{status:404});
    const filter=parseExpenseFilters(new URL(request.url).searchParams);
    const result=await expenseExport(id,filter);
    if(result.rows.length>20000)
      return new Response("A exportação ultrapassou 20 mil lançamentos. Filtre por mês ou categoria.",{status:413});
    const wb=new ExcelJS.Workbook();
    wb.creator="Livro Caixa Inteligente";
    wb.created=new Date();
    const list=wb.addWorksheet("Saídas",{views:[{state:"frozen",ySplit:4}]});
    list.mergeCells("A1:J1");
    list.getCell("A1").value="LIVRO CAIXA — SAÍDAS";
    list.getCell("A1").font={size:16,bold:true,color:{argb:"FF153A63"}};
    list.mergeCells("A2:J2");
    list.getCell("A2").value=safeText(title.rows[0].nome)+" • Relatório de saídas";
    list.getCell("A2").font={size:11,color:{argb:"FF53677D"}};
    list.mergeCells("A3:J3");
    list.getCell("A3").value="Filtros: "+(filter.mes||"todos os meses")+
      " | "+(filter.q||"sem busca")+" | "+filter.status+
      " | Exportado em "+new Date().toLocaleString("pt-BR");
    list.getCell("A3").font={size:9,color:{argb:"FF6B7D8E"}};
    const headers=["Data do pagamento","Competência","Título / descrição","Categoria","Contraparte",
      "Documento","Referência","Tipo","Valor (R$)","Situação"];
    list.getRow(4).values=headers;
    list.getRow(4).height=27;
    list.getRow(4).eachCell(c=>{
      c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF23496F"}};
      c.font={bold:true,color:{argb:"FFFFFFFF"}};
      c.alignment={vertical:"middle"};
    });
    list.columns=[
      {key:"registro",width:18},{key:"competencia",width:15},{key:"titulo",width:36},
      {key:"categoria",width:28},{key:"contraparte",width:34},{key:"documento",width:30},
      {key:"referencia",width:26},{key:"tipo",width:17},{key:"valor",width:20},
      {key:"situacao",width:19},
    ];
    const totals=new Map<string,{count:number;sum:number}>();
    let overall=0;
    for(const row of result.rows){
      const value=cents(row.valor);overall+=value;
      const mes=row.competencia.slice(0,7);
      const total=totals.get(mes)||{count:0,sum:0};
      total.count++;total.sum+=value;totals.set(mes,total);
      const added=list.addRow([
        row.data_pagamento?new Date(row.data_pagamento+"T12:00:00Z"):null,
        mes,safeText(row.titulo),safeText([row.categoria,row.subcategoria].filter(Boolean).join(" / ")||"Sem categoria"),
        safeText(row.contraparte),safeText(row.documento||"Sem documento"),
        safeText(row.referencia),row.tipo==="outro"?"Não classificado":"Saída",
        money(value),row.tem_documento?"Com documento":"Sem documento"
      ]);
      added.getCell(1).numFmt="dd/mm/yyyy";
      added.getCell(9).numFmt=currencyFmt;
      if(added.number%2===0)added.eachCell(c=>{
        c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFF5F8FC"}};
      });
    }
    const sumRow=list.addRow(["TOTAL","","","","","","","",money(overall),""]);
    sumRow.font={bold:true,color:{argb:"FF153A63"}};
    sumRow.getCell(9).numFmt=currencyFmt;
    list.autoFilter={from:{row:4,column:1},to:{row:Math.max(4,sumRow.number-1),column:10}};
    const summary=wb.addWorksheet("Totais por mês");
    summary.columns=[{width:24},{width:22},{width:25}];
    const heading=summary.addRow(["Competência","Lançamentos","Total de saídas"]);
    heading.eachCell(c=>{
      c.font={bold:true,color:{argb:"FFFFFFFF"}};
      c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF23496F"}};
    });
    for(const [month,values] of [...totals].sort((a,b)=>b[0].localeCompare(a[0]))){
      const added=summary.addRow([label(month),values.count,money(values.sum)]);
      added.getCell(3).numFmt=currencyFmt;
    }
    const totalRow=summary.addRow(["TOTAL",result.rows.length,money(overall)]);
    totalRow.font={bold:true,color:{argb:"FF153A63"}};
    totalRow.getCell(3).numFmt=currencyFmt;
    const buffer=await wb.xlsx.writeBuffer();
    const filename="livro-caixa-saidas-"+id+"-"+(filter.mes||"todos")+".xlsx";
    return new Response(new Uint8Array(buffer),{
      headers:{"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":'attachment; filename="'+filename+'"',
        "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}
    });
  }catch(e){
    console.error("Falha exportação Excel",id,e);
    return new Response("Falha ao gerar planilha Excel",{status:500});
  }
}