// Nome de apresentação gerado a partir de dados estruturados já identificados.
// O arquivo original permanece intocado: nome exibido não altera bytes ou hash.
export type DocumentNameData = {
  originalName:string;
  documentType?:string|null;
  title?:string|null;
  counterparty?:string|null;
  category?:string|null;
  subcategory?:string|null;
  description?:string|null;
  paymentDate?:string|null;
};

const compact=(value:string|null|undefined):string=>
  String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toUpperCase().replace(/[^A-Z0-9]+/g," ").trim().replace(/\s+/g," ");

const extension=(original:string):string=>{
  const match=String(original).match(/\.([a-zA-Z0-9]{2,5})$/);
  return match?match[1].toLowerCase():"";
};

function label(data:DocumentNameData):string{
  const text=compact([data.documentType,data.title,data.description].join(" "));
  const kind=compact(data.documentType);
  if(kind.includes("NOTA FISCAL")||/\bNF E\b/.test(kind))return "NOTA FISCAL";
  if(kind.includes("BOLETO"))return "BOLETO";
  if(kind.includes("TRIBUTO")||/\bDARF\b/.test(text))return "TRIBUTO";
  if(kind.includes("RECIBO"))return "RECIBO";
  if(kind.includes("CONTRATO"))return "CONTRATO";
  if(/\bPIX\b/.test(text))return "PIX";
  if(kind.includes("COMPROVANTE"))return "PAGAMENTO";
  if(kind==="IMAGEM"||kind==="DOCUMENTO"||kind==="OUTRO")return "DOCUMENTO";
  return "";
}

function purpose(data:DocumentNameData):string{
  const category=compact([data.category,data.subcategory].join(" "));
  const context=compact([data.counterparty,data.description,data.title].join(" "));
  if(/COMPRAS FAZENDA/.test(category)){
    if(/FERTILIZANT|ADUBO|UREIA|NPK/.test(context))return "FERTILIZANTES";
    if(/SEMENT/.test(context))return "SEMENTES";
    if(/DEFENSIV|FUNGICIDA|HERBICIDA|INSETICIDA/.test(context))return "DEFENSIVOS";
  }
  if(/ABASTECIMENTO|COMBUSTIVE|DIESEL|GASOLINA|ETANOL/.test(category)){
    if(/\bPOSTO\b|ABASTECIMENTO/.test(context))return "ABASTECIMENTO";
    if(/DIESEL/.test(category))return "DIESEL";
    if(/GASOLINA/.test(category))return "GASOLINA";
    return "COMBUSTIVEIS";
  }
  if(/MANUTENCAO/.test(category)&&(/\bPECAS?\b/.test(category)||/\bPECAS?\b/.test(context)))return "PECAS";
  if(/MANUTENCAO/.test(category)&&/SERVIC/.test(category))return "MANUTENCAO";
  if(/FERTILIZANT|ADUBO/.test(category))return "FERTILIZANTES";
  if(/SEMENTE/.test(category))return "SEMENTES";
  if(/DEFENSIVO/.test(category))return "DEFENSIVOS";
  if(/SALARIO/.test(category))return "SALARIOS";
  if(/ENCARGO/.test(category))return "ENCARGOS";
  // Fora dessas categorias, reaproveitar classificação específica aprovada.
  // Categorias genéricas não são uma descrição confiável da compra.
  const sub=compact(data.subcategory);
  if(sub&&!["OUTROS","OUTRAS DESPESAS","OUTRO","GERAL"].includes(sub))return sub.slice(0,35);
  const main=compact(data.category);
  if(main&&!["OUTRAS DESPESAS","OUTROS","OUTRO","SEM CATEGORIA","RECEITAS"].includes(main))
    return main.slice(0,35);
  return "";
}

function dateSuffix(value:string|null|undefined):string{
  const match=String(value||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!match)return "";
  const [,y,m,d]=match;
  const parsed=new Date(Date.UTC(Number(y),Number(m)-1,Number(d)));
  if(parsed.getUTCFullYear()!==Number(y)||parsed.getUTCMonth()+1!==Number(m)||
      parsed.getUTCDate()!==Number(d))return "";
  return d+"-"+m+"-"+y;
}

export function suggestDocumentName(data:DocumentNameData):string{
  const original=String(data.originalName||"").trim();
  const party=compact(data.counterparty);
  const kind=label(data);
  // Só renomear quando houver identificação útil. Nunca inventar recebedores
  // nem apresentar o nome técnico de um documento como classificação real.
  if(!kind||party.length<3||["NAO IDENTIFICADO","SEM RECEBEDOR","DESCONHECIDO"].includes(party))
    return original;
  const suffix=extension(original);
  const chunks=[kind,purpose(data),party.slice(0,75),dateSuffix(data.paymentDate)].filter(Boolean);
  const basename=chunks.join(" ").slice(0,175).trim();
  return basename+(suffix?"."+suffix:"");
}
