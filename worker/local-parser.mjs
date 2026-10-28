// Extrator local determinístico para documentos rurais brasileiros.
// Não usa serviços externos nem cria informações que não estejam presentes no OCR.
export function normalizeLocal(value) {
  return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toUpperCase().replace(/\s+/g," ").trim();
}
const clean = value=>String(value||"").trim().replace(/\s+/g," ").slice(0,180);
const withoutPageMarkers = t=>String(t||"").replace(/^PÁGINA \d+ DE \d+\s*$/gmi,"").trim();
const allDigits = value=>String(value||"").replace(/\D/g,"");

function kindOf(t,filename,defaultKind) {
  const s=normalizeLocal(t.slice(0,14000)+"\n"+filename);
  if(/\bDANFE\b|NOTA FISCAL ELETRONICA|\bNF-E\b|\bNFE\b/.test(s))return "nota fiscal";
  if(/\bDARF\b|DOCUMENTO DE ARRECADACAO|\bDARE\b|\bGPS INSS\b/.test(s))return "tributo";
  if(/\bBOLETO\b|FICHA DE COMPENSACAO|LINHA DIGITAVEL|RECIBO DO PAGADOR/.test(s))return "boleto";
  if(/\bCOMPROVANTE\b|TRANSACAO REALIZADA|PAGAMENTO EFETUADO|TRANSFERENCIA REALIZADA/.test(s))return "comprovante";
  if(/\bRECIBO\b/.test(s))return "recibo";
  if(/\bCONTRATO\b|TERMO ADITIVO/.test(s))return "contrato";
  return defaultKind==="application/pdf"?"documento":defaultKind==="application/xml"?"nota fiscal":"imagem";
}

function extractLabel(t,labels,max=130) {
  const lines=t.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  for(const label of labels){
    const regex=new RegExp("^(?:"+label+")(?:\\s*[:\\-–]\\s*|\\s{2,})(.+)$","i");
    for(const line of lines){
      const match=line.match(regex);
      if(!match)continue;
      const value=clean(match[1]);
      if(value&&value.length>=3 && !/^(?:CNPJ|CPF|VALOR|DATA|EMISS[AÃ]O|INSCRI[CÇ][AÃ]O|CEP|ENDERE[CÇ]O|UF)\b/i.test(value))
        return value.slice(0,max);
    }
  }
  return "";
}

function findParty(t,kind) {
  const lines=t.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  const preferred=kind==="comprovante"||kind==="boleto"?
    ["(?:FAVORECIDO|RECEBEDOR|BENEFICI[AÁ]RIO|DESTINAT[AÁ]RIO)","(?:NOME DO FAVORECIDO|NOME DO BENEFICI[AÁ]RIO)"]:
    ["(?:RAZ[AÃ]O SOCIAL|NOME DO EMITENTE|FORNECEDOR|EMITENTE)","(?:NOME FANTASIA|PRESTADOR)"];
  const fromLabel=extractLabel(t,preferred,145);
  if(fromLabel)return fromLabel;
  for(let i=0;i<lines.length-1;i++){
    if(/^(EMITENTE|FORNECEDOR|FAVORECIDO|BENEFICI[AÁ]RIO|RECEBEDOR|RAZ[AÃ]O SOCIAL)\s*:?\s*$/i.test(lines[i])){
      const next=lines[i+1];
      if(next.length>4&&!/^\d[\d./-]+$/.test(next)&&!/(?:CNPJ|CPF|INSCRI[CÇ][AÃ]O)/i.test(next))
        return clean(next).slice(0,145);
    }
  }
  return "";
}

function extractReference(t,kind) {
  const normalized=normalizeLocal(t);
  if(kind==="nota fiscal") {
    const key=normalized.match(/(?:CHAVE DE ACESSO|CHAVE NFE)(?:\s*[:\-])?\s*([\d\s.\-]{44,85})/)?.[1]||"";
    const digits=allDigits(key);
    if(digits.length>=44)return digits.slice(0,44);
    // Documento com 44 dígitos sem rótulo, mas nunca tratar CPF/CNPJ como chave.
    const candidate=t.match(/(?:\d[\s.]?){44}/)?.[0];
    if(candidate&&allDigits(candidate).length===44)return allDigits(candidate);
  }
  if(kind==="boleto") {
    const line=normalized.match(/(?:LINHA DIGITAVEL|CODIGO DE BARRAS)(?:\s*[:\-])?\s*([\d\s.\-]{44,85})/)?.[1]||"";
    const digits=allDigits(line);
    if([44,47,48].includes(digits.length))return digits;
  }
  const id=extractLabel(t,["(?:ID DA TRANSACAO|IDENTIFICADOR DA TRANSACAO|NUMERO DO DOCUMENTO|AUTENTICACAO BANCARIA|CODIGO DE AUTENTICACAO)"],90);
  return id;
}

function numberOfInvoice(t) {
  return t.match(/(?:N[º°o.]?\s*(?:DA\s+)?NOTA|N[ÚU]MERO\s+(?:DA\s+)?(?:NF|NOTA)|N[º°]\s*(?:NF-E)?)[\s:.-]{0,12}(\d{1,12})/i)?.[1]||"";
}

function dateCandidate(t) {
  const s=normalizeLocal(t);
  const labels=[
    /(?:COMPETENCIA|REFERENCIA|PERIODO DE APURACAO|EXERCICIO)\s*[:\-]?\s*((?:0[1-9]|1[0-2])\/20\d{2}|20\d{2}[-/](?:0[1-9]|1[0-2])|\d{2}\/\d{2}\/20\d{2}|20\d{2})/,
    /(?:DATA DE EMISSAO|EMITIDO EM|EMISSAO|DATA DO PAGAMENTO|DATA DA TRANSACAO|VENCIMENTO|DATA)\s*[:\-]?\s*(\d{2}\/\d{2}\/20\d{2}|20\d{2}-\d{2}-\d{2}|\d{2}\/20\d{2})/
  ];
  for(const re of labels){
    const m=s.match(re);
    if(m){
      if(/^\d{4}$/.test(m[1]))return m[1]+"-01";
      return m[1];
    }
  }
  // Último recurso: uma data explícita encontrada no texto, jamais o dia atual como se viesse do PDF.
  const m=s.match(/\b((?:0?[1-9]|[12]\d|3[01])\/(?:0?[1-9]|1[0-2])\/20\d{2}|20\d{2}-(?:0[1-9]|1[0-2])-\d{2})\b/);
  return m?.[1]||"";
}

function monetary(t) {
  const s=normalizeLocal(t);
  const money="(?:R\\$\\s*)?(\\d{1,3}(?:\\.\\d{3})*,\\d{2}|\\d{1,12}[,.]\\d{2})";
  const labels=[
    "VALOR TOTAL DA NOTA","VALOR DA NOTA","VALOR TOTAL DO DOCUMENTO","VALOR DO DOCUMENTO",
    "VALOR PAGO","VALOR DO PAGAMENTO","VALOR A PAGAR","TOTAL A PAGAR",
    "VALOR TOTAL","VALOR DA TRANSACAO","VALOR","TOTAL"
  ];
  for(const label of labels){
    const regex=new RegExp("\\b"+label+"\\b\\s*[:\\-]?\\s*"+money);
    const match=s.match(regex);
    if(match)return match[1];
  }
  return "";
}

function categoryOf(t) {
  const s=normalizeLocal(t);
  const rules=[
    [/DIESEL|GASOLINA|ETANOL|COMBUSTIVEL|OLEO DIESEL/,"Combustíveis > Diesel"],
    [/SEMENTE|TRATAMENTO DE SEMENTES|SEMENTES DE SOJA|SEMENTES DE MILHO/,"Insumos Agrícolas > Sementes"],
    [/FERTILIZANTE|ADUBO|UREIA|NPK|CLORETO DE POTASSIO|MAP\b/,"Insumos Agrícolas > Fertilizantes"],
    [/HERBICIDA|FUNGICIDA|INSETICIDA|DEFENSIVO|GLIFOSATO/,"Insumos Agrícolas > Defensivos"],
    [/PECAS DE REPOSICAO|PECA AGRICOLA|ROLAMENTO|FILTRO DE OLEO|CORREIA|MANGUEIRA HIDRAULICA/,"Manutenção > Peças"],
    [/SALARIO|FOLHA DE PAGAMENTO|PROVENTOS/,"Pessoal > Salários"],
    [/FGTS|INSS|GPS PREVIDENCIA/,"Pessoal > Encargos"],
  ];
  const matches=rules.filter(([regex])=>regex.test(s));
  return matches.length===1?matches[0][1]:"";
}

function transactionKind(t,kind) {
  const s=normalizeLocal(t.slice(0,10000));
  if(kind==="comprovante"){
    if(/COMPROVANTE DE RECEBIMENTO|CREDITO RECEBIDO|RECEBIMENTO DE PIX/.test(s))return "receita";
    if(/COMPROVANTE DE PAGAMENTO|PAGAMENTO REALIZADO|PAGAMENTO EFETUADO|TRANSFERENCIA ENVIADA|PIX ENVIADO/.test(s))
      return "despesa";
  }
  if(kind==="boleto"||kind==="tributo")return "despesa";
  return "outro";
}

function summary(t,kind,name,party) {
  const lines=withoutPageMarkers(t).split(/\r?\n/).map(l=>clean(l)).filter(l=>l.length>5);
  const relevant=lines.filter(l=>/(?:DESCRI[CÇ][AÃ]O|PRODUTO|SERVI[CÇ]O|HIST[ÓO]RICO|REFER[ÊE]NCIA|APURA[CÇ][AÃ]O|ITR|DIESEL|SEMENTE|ADUBO|FERTILIZANTE|DEFENSIVO)/i.test(l))
    .filter(l=>!/\bCNPJ\b|\bCPF\b|CHAVE DE ACESSO/.test(normalizeLocal(l)));
  if(relevant.length)return clean(relevant.slice(0,2).join(" — ")).slice(0,380);
  return clean(kind+" — "+(party||name.replace(/\.[^.]+$/,""))).slice(0,380);
}

function parseOne(t,name,defaultKind,first,last) {
  const kind=kindOf(t,name,defaultKind);
  const party=findParty(t,kind);
  const reference=extractReference(t,kind);
  const competence=dateCandidate(t);
  const value=monetary(t);
  const category=categoryOf(t);
  const number=kind==="nota fiscal"?numberOfInvoice(t):"";
  const typeName=kind==="nota fiscal"?"Nota fiscal":kind==="comprovante"?"Comprovante":
    kind==="boleto"?"Boleto":kind==="tributo"?"Tributo":kind==="recibo"?"Recibo":
    kind==="contrato"?"Contrato":"Documento";
  const title=[typeName+(number?" nº "+number:""),party].filter(Boolean).join(" — ");
  const avisos=[];
  if(!party)avisos.push("Contraparte não identificada com segurança.");
  if(!competence)avisos.push("Data ou competência não localizada.");
  if(!value)avisos.push("Valor principal não identificado.");
  if(!category)avisos.push("Categoria não determinada com segurança.");
  const evidence=[party,competence,value,category,reference].filter(Boolean).length;
  const confidence=Math.min(0.85,Math.max(0.3,0.30+evidence*0.11));
  return {titulo:title||name.replace(/\.[^.]+$/,""),documento_tipo:kind,contraparte:party,
    competencia:competence,categoria:category,tipo:transactionKind(t,kind),
    descricao:summary(t,kind,name,party),valor:value,referencia:reference,
    pagina_inicial:first,pagina_final:last,confianca:confidence,avisos,
    trecho:t.slice(0,120000)};
}

export function parseLocalDocument(text,name,kind) {
  const pageRegex=/^PÁGINA (\d+) DE (\d+)\s*$/gm;
  const pages=[];
  let match,lastIndex=0,lastPage=0;
  while((match=pageRegex.exec(text))!==null){
    if(lastPage&&pages.length)pages[pages.length-1].text=text.slice(lastIndex,match.index);
    pages.push({page:Number(match[1]),text:""});
    lastPage=Number(match[1]);
    lastIndex=pageRegex.lastIndex;
  }
  if(pages.length)pages[pages.length-1].text=text.slice(lastIndex);
  if(pages.length<=1)return [parseOne(text,name,kind,pages[0]?.page||1,pages[0]?.page||1)];
  // Separar apenas quando cada documento for identificado por referência inequívoca distinta.
  // Quando uma página não tem referência, conservar no mesmo grupo para não separar notas multipágina.
  const groups=[];
  let current=null;
  for(const page of pages){
    const detected=kindOf(page.text,name,kind);
    const ref=extractReference(page.text,detected);
    const strong=/^\d{44,48}$/.test(ref)||(/[A-Za-z0-9]/.test(ref)&&ref.length>=20);
    if(current&&strong&&current.ref&&ref!==current.ref){
      groups.push(current);
      current=null;
    }
    if(!current)current={first:page.page,last:page.page,ref:strong?ref:"",parts:[]};
    current.last=page.page;
    if(strong&&!current.ref)current.ref=ref;
    current.parts.push(page.text);
  }
  if(current)groups.push(current);
  return groups.map(g=>parseOne(g.parts.join("\n\n"),name,kind,g.first,g.last)).slice(0,50);
}
