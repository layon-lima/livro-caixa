import { Pool } from "pg";
import { parseLocalDocument } from "./local-parser.mjs";
import { analyzeWithOllama } from "./ollama-analyzer.mjs";
import { candidateNewOwner, receiverCnpj, lookupPublicCnpj, confirmedPixReceiver, suggestCategoryFromCompany } from "./company-lookup.mjs";
import { XMLParser } from "fast-xml-parser";
import { bestCategory } from "./category-suggestions.mjs";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { gunzipSync } from "node:zlib";
import { execFile as nodeExec } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(nodeExec);
const db = new Pool({host:process.env.PGHOST,user:process.env.PGUSER,password:process.env.PGPASSWORD,database:process.env.PGDATABASE});
const ROOT = process.env.LC_STORAGE_DIR || "/data/livro-caixa-arquivos";
function compressedPath(key) {
  if(!/^originais\/[a-f0-9]{2}\/[a-f0-9]{64}\.gz$/.test(key))throw Error("Chave local inválida");
  const root=resolve(ROOT), full=resolve(root,key);
  if(!full.startsWith(root+sep))throw Error("Caminho local inválido");
  return full;
}
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
const short=(s,n=300)=>String(s||"").trim().slice(0,n);
function competence(value) {
  const s=String(value||"");
  let m=s.match(/(20\d\d)[-/](0[1-9]|1[0-2])/);
  if(m)return {date:m[1]+"-"+m[2]+"-01",estimated:false};
  m=s.match(/(?:^|\D)(?:0[1-9]|[12]\d|3[01])\/(0[1-9]|1[0-2])\/(20\d\d)(?:\D|$)/);
  if(m)return {date:m[2]+"-"+m[1]+"-01",estimated:false};
  m=s.match(/(?:^|\D)(0[1-9]|1[0-2])\/(20\d\d)(?:\D|$)/);
  if(m)return {date:m[2]+"-"+m[1]+"-01",estimated:false};
  return {date:new Date().toISOString().slice(0,7)+"-01",estimated:true};
}
function amount(value){
  if(value===null||value===undefined||value==="")return null;
  let s=String(value).replace(/[^\d,.-]/g,"");
  if(s.includes(",")&&s.includes("."))s=s.replace(/\./g,"").replace(",",".");
  else s=s.replace(",",".");
  const n=Number(s);return Number.isFinite(n)&&n>=0&&n<1e14?n.toFixed(2):null;
}
function invoiceXml(xml) {
  try{
    const d=new XMLParser({ignoreAttributes:false,attributeNamePrefix:"@"}).parse(xml);
    const n=d.nfeProc?.NFe?.infNFe||d.NFe?.infNFe;
    if(!n)return null;
    const prods=Array.isArray(n.det)?n.det:[n.det].filter(Boolean);
    return [{
      titulo:short("NF "+(n.ide?.nNF||"")+" — "+(n.emit?.xNome||""),170),
      documento_tipo:"nota fiscal",contraparte:short(n.emit?.xNome,150),
      competencia:n.ide?.dhEmi?.slice(0,7)||n.ide?.dEmi?.slice(0,7)||"",
      categoria:"",tipo:"outro",descricao:short(prods.map(x=>x?.prod?.xProd).join("; "),1000),
      valor:n.total?.ICMSTot?.vNF||"",referencia:short(n["@Id"]||n.ide?.nNF,100).replace(/^NFe/,""),
      emitente_nome:short(n.emit?.xNome,150),destinatario_nome:short(n.dest?.xNome,150),
      pagina_inicial:1,pagina_final:1
    }];
  }catch{return null;}
}
async function extract(buf,mime,dir){
  const original=join(dir,"original");
  await writeFile(original,buf);
  if(mime==="application/xml"){
    const raw=buf.toString("utf8");
    return {text:raw.replace(/<[^>]*>/g," "),xml:invoiceXml(raw)};
  }
  if(mime==="application/pdf"){
    // Extrai e analisa CADA página. PDFs mistos costumam ter páginas com texto
    // nativo e páginas escaneadas: a detecção global perde essas digitalizações.
    const info=await exec("pdfinfo",[original],{timeout:20000,maxBuffer:1024*1024});
    const pageCount=Number(info.stdout.match(/^Pages:\s*(\d+)/m)?.[1]||0);
    if(!Number.isInteger(pageCount)||pageCount<1)throw Error("Não foi possível identificar as páginas do PDF.");
    // Limite explícito de segurança, sem truncamento silencioso.
    if(pageCount>300)throw Error("PDF com mais de 300 páginas: divida em arquivos menores para OCR seguro.");
    const texts=[];
    for(let page=1;page<=pageCount;page++){
      let nativeText="";
      try {
        const native=await exec("pdftotext",["-f",String(page),"-l",String(page),"-layout",original,"-"],
          {timeout:60000,maxBuffer:5*1024*1024});
        nativeText=native.stdout.trim();
      }catch(e){
        console.warn("Extração nativa falhou, tentando OCR na página",page,String(e));
      }
      let pageText=nativeText;
      if(nativeText.replace(/\s/g,"").length<80){
        const imagePrefix=join(dir,"scan-"+page);
        await exec("pdftoppm",["-f",String(page),"-l",String(page),"-singlefile","-r","180",
          "-gray","-png",original,imagePrefix],{timeout:120000,maxBuffer:1024*1024});
        const recognized=await exec("tesseract",[imagePrefix+".png","stdout","-l","por+eng"],
          {timeout:90000,maxBuffer:5*1024*1024});
        pageText=recognized.stdout.trim()||nativeText;
        await rm(imagePrefix+".png",{force:true});
      }
      texts.push("PÁGINA "+page+" DE "+pageCount+"\n"+pageText);
    }
    const text=texts.join("\n\n");
    if(text.replace(/PÁGINA \d+ DE \d+/g,"").trim().length<12)
      throw Error("OCR não encontrou texto legível no PDF. Verifique a qualidade do documento.");
    return {text,xml:null};
  }
  const o=await exec("tesseract",[original,"stdout","-l","por+eng"],
    {maxBuffer:5*1024*1024,timeout:90000});
  if(o.stdout.trim().length<12)throw Error("OCR não encontrou texto legível na imagem.");
  return {text:o.stdout,xml:null};
}

function normalizeName(value) {
  return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toUpperCase().replace(/[^A-Z0-9]/g," ").replace(/\s+/g," ").trim();
}
function recognizedOwner(text,books) {
  const haystack=" "+normalizeName(text)+" ";
  const matched=books.filter(b=>haystack.includes(" "+normalizeName(b.nome)+" "));
  return matched.length===1?matched[0]:null;
}
function fromAiOwner(value,books) {
  const term=normalizeName(value);
  if(!term)return null;
  return books.find(b=>String(b.id)===String(value)||normalizeName(b.nome)===term)||null;
}
async function processFile(file){
  const timing={started:Date.now(),ocr_ms:0,cnpj_ms:0,ia_ms:0};
  const folder=await mkdtemp(join(tmpdir(),"lc-"));
  try{
    if(file.armazenamento!=="local")throw Error("Arquivo anterior requer migração para a VPS");
    const bytes=gunzipSync(await readFile(compressedPath(file.chave_armazenamento)));
    const output=await extract(bytes,file.mime,folder);
    timing.ocr_ms=Date.now()-timing.started;
    const [categories,books]=await Promise.all([
      db.query("SELECT id::text,nome,subcategoria FROM categorias"),
      db.query(
        "SELECT t.id::text,t.nome FROM titulares t "+
        "JOIN users u ON u.id=$1 AND u.is_active=TRUE "+
        "WHERE u.is_admin=TRUE OR EXISTS ("+
        "SELECT 1 FROM user_titular_permissions p WHERE p.user_id=u.id AND p.titular_id=t.id AND p.can_import=TRUE)",
        [file.enviado_por]
      )
    ]);
    const cats=categories.rows;
    const allowedBooks=books.rows;
    // Comparar com todos os titulares existentes (inclusive os não autorizados),
    // para nunca sugerir criar um cadastro duplicado.
    const allNames=(await db.query("SELECT nome FROM titulares")).rows.map(x=>x.nome);
    const defaultBook=allowedBooks.find(x=>String(x.id)===String(file.titular_envio_id));
    if(!defaultBook)throw Error("Titular do envio não está autorizado para o usuário.");
    // O modelo só carrega durante a análise e descarrega ao terminar (keep_alive: 0).
    let method=output.xml?"xml":"local";
    let aiNotice="";
    let items=output.xml||parseLocalDocument(output.text,file.nome_original,file.mime);
    if(!items.length)throw Error("Não foi possível identificar documentos no arquivo.");
    // Primeira etapa: OCR detecta campos e possíveis titulares ainda não cadastrados.
    const first=items[0];
    // Categorias genéricas do OCR não devem impedir sugestões específicas da IA/CNPJ.
    if(["OUTRAS DESPESAS","OUTRA DESPESA"].includes(normalizeName(first.categoria)))
      first.categoria="";
    const protectedPixReceiver=items.length===1?confirmedPixReceiver(output.text):"";
    // Dados estruturados do comprovante têm prioridade sobre interpretações do modelo.
    if(protectedPixReceiver&&normalizeName(first.contraparte)!==normalizeName(protectedPixReceiver)){
      first.contraparte=protectedPixReceiver;
      first.titulo="Comprovante Pix — "+protectedPixReceiver;
    }
    const knownNames=allNames;
    const localSuggestedOwner=candidateNewOwner(output.text,first.documento_tipo,knownNames);
    let companyInfo=null;
    let companyRecord={};
    // Busca pública só por CNPJ válido e ancorado ao recebedor/contraparte.
    // Não enviar PDF, CPF nem conteúdo OCR para serviços externos.
    const possibleCnpj=items.length===1?
      receiverCnpj(output.text,first.contraparte,first.documento_tipo):"";
    const dateInitial=competence(first.competencia);
    const matchingOwner=recognizedOwner(output.text,allowedBooks);
    const initialFields={
      titulo:short(first.titulo,170),documento_tipo:short(first.documento_tipo,50),
      contraparte:short(first.contraparte,150),competencia:dateInitial.estimated?"":dateInitial.date.slice(0,7),
      categoria:short(first.categoria,120),tipo:short(first.tipo,15),
      descricao:short(first.descricao,600),valor:short(first.valor,40),
      referencia:short(first.referencia,100),
      ...(matchingOwner?{titular_id:String(matchingOwner.id)}:{}),
      ...(localSuggestedOwner?{titular_sugerido:localSuggestedOwner}:{})
    };
    await db.query(
      "UPDATE arquivos SET progresso_etapa=$2,progresso_dados=$3::jsonb,atualizado_em=now() WHERE id=$1",
      [file.id,output.xml?"xml":"ocr",JSON.stringify(initialFields)]
    );
    // Consulta somente o CNPJ do beneficiário, nunca o texto do comprovante.
    // OCR já está publicado: esta consulta não bloqueia a abertura da tela.
    if(possibleCnpj){
      const lookupStarted=Date.now();
      await db.query("UPDATE arquivos SET progresso_etapa='pesquisando',"+
        "progresso_dados=progresso_dados || $2::jsonb,atualizado_em=now() WHERE id=$1",
        [file.id,JSON.stringify({consulta_empresa:{cnpj:possibleCnpj,status:"consultando"}})]);
      try{
        const result=await lookupPublicCnpj(possibleCnpj);
        // Confirme que a empresa pública corresponde à linha Nome do recebedor.
        // O CNPJ de um intermediário não pode substituir o beneficiário.
        const payee=normalizeName(protectedPixReceiver||first.contraparte);
        const fantasy=normalizeName(result?.nome_fantasia);
        const legal=normalizeName(result?.razao_social);
        const matches=payee.length>=4&&(fantasy===payee||legal===payee||
          (payee.length>=9&&legal.includes(payee)));
        // O CNPJ veio da seção "Dados de quem recebeu" do comprovante Pix.
        // Mesmo que o banco mostre nome comercial abreviado, ele identifica
        // a mesma pessoa jurídica; preservar SEMPRE o recebedor do comprovante.
        const cnpjAnchored=Boolean(protectedPixReceiver);
        if(matches||cnpjAnchored){
          companyInfo=result;
          companyRecord={...result,status:matches?"confirmado":"identificado_cnpj"};
        }else{
          companyRecord={cnpj:possibleCnpj,status:"divergente",fonte:"BrasilAPI"};
          console.warn("Consulta CNPJ não confirmou nome do recebedor",file.id);
        }
      }catch(e){
        companyRecord={cnpj:possibleCnpj,status:"indisponivel",fonte:"BrasilAPI"};
        console.warn("Consulta pública de CNPJ não disponível",file.id,String(e).slice(0,150));
      }
      await db.query("UPDATE arquivos SET progresso_dados=progresso_dados || $2::jsonb,atualizado_em=now() WHERE id=$1",
        [file.id,JSON.stringify({consulta_empresa:companyRecord})]);
      timing.cnpj_ms=Date.now()-lookupStarted;
    }
    // Categoria por atividade pública é um palpite, já preenchido para o usuário
    // ajustar se necessário. Não exige uma confirmação separada da aprovação comum.
    const companyCategory=companyInfo?suggestCategoryFromCompany(companyInfo,cats):"";
    if(companyCategory&&(!first.categoria||normalizeName(first.categoria)==="OUTRAS DESPESAS")){
      first.categoria=companyCategory;
      await db.query("UPDATE arquivos SET progresso_dados=progresso_dados || $2::jsonb,atualizado_em=now() WHERE id=$1",
        [file.id,JSON.stringify({categoria:companyCategory})]);
    }
    // Pix com beneficiário + CNPJ + valor + data + identificador confiáveis não
    // precisa aguardar inferência pesada. A categoria é apenas uma sugestão.
    const rapidPix=Boolean(protectedPixReceiver&&companyInfo&&companyCategory&&
      first.tipo==="despesa"&&first.valor&&first.competencia&&first.referencia&&
      /^E[A-Za-z0-9]{20,}$/.test(first.referencia)&&!dateInitial.estimated&&
      items.length===1);
    if(rapidPix){
      console.log("Comprovante Pix validado por OCR + CNPJ, sem inferência pesada",file.id);
    }
    if(!rapidPix&&method==="local" && process.env.OLLAMA_URL){
      const aiStarted=Date.now();
      try{
        const labels=cats.map(x=>x.nome+(x.subcategoria?" > "+x.subcategoria:""));
        const maxPages=Number(output.text.match(/^PÁGINA \d+ DE (\d+)/m)?.[1]||1);
        await db.query("UPDATE arquivos SET progresso_etapa='ia',atualizado_em=now() WHERE id=$1",[file.id]);
        const fromOllama=await analyzeWithOllama({
          text:output.text,filename:file.nome_original,categories:labels,
          owners:allowedBooks,maxPages,publicCompany:companyInfo,
          onPartial:async fields=>{
            if(!Object.keys(fields).length)return;
            if(protectedPixReceiver&&fields.contraparte&&
               normalizeName(fields.contraparte)!==normalizeName(protectedPixReceiver)){
              fields.contraparte=protectedPixReceiver;
              fields.titulo="Comprovante Pix — "+protectedPixReceiver;
            }
            if(fields.titular_sugerido&&allNames.some(x=>normalizeName(x)===normalizeName(fields.titular_sugerido)))
              delete fields.titular_sugerido;
            if(!Object.keys(fields).length)return;
            await db.query("UPDATE arquivos SET progresso_dados=progresso_dados || $2::jsonb,atualizado_em=now() WHERE id=$1",
              [file.id,JSON.stringify(fields)]);
          }
        });
        if(fromOllama?.length){
          items=fromOllama;method="ia";
          // Se a IA não encontrou categoria, aproveita o palpite público já disponível.
          if(items.length===1&&(!items[0].categoria||
            ["OUTRAS DESPESAS","OUTRA DESPESA"].includes(normalizeName(items[0].categoria)))&&companyCategory)
            items[0].categoria=companyCategory;
          if(protectedPixReceiver&&items.length===1&&
             normalizeName(items[0].contraparte)!==normalizeName(protectedPixReceiver)){
            items[0].contraparte=protectedPixReceiver;
            items[0].titulo="Comprovante Pix — "+protectedPixReceiver;
            items[0].avisos=[...(items[0].avisos||[]),
              "O nome do recebedor foi corrigido pela seção explícita do comprovante."];
          }
        }
        else {
          aiNotice="IA Central retornou dados incompletos ou inválidos; mantida leitura OCR local.";
          console.warn("IA Central sem dados válidos; mantido extrator local",file.id);
        }
      }catch(e){
        const detail=String(e instanceof Error?e.message:e).slice(0,125);
        aiNotice="IA Central não concluiu a leitura ("+detail+"); mantido OCR local.";
        console.warn("IA Central indisponível, mantido OCR local",file.id,detail);
      }finally{
        timing.ia_ms=Date.now()-aiStarted;
      }
    }

    const connection=await db.connect();
    try{
      await connection.query("BEGIN");
      for(const item of items){
        const notice=[];
        if(aiNotice)notice.push(aiNotice);
        const suggested=short(item.titular_sugerido||localSuggestedOwner,120);
        const cleanSuggested=suggested&&
          !allNames.some(x=>normalizeName(x)===normalizeName(suggested))?
          suggested.toLocaleUpperCase("pt-BR"):"";
        if(cleanSuggested)notice.push("Possível titular não cadastrado: "+cleanSuggested+". Confirme antes de criar.");
        const fullText=item.trecho||output.text;
        const hinted=fromAiOwner(item.titular_id||item.titular_nome,allowedBooks);
        const seller=fromAiOwner(item.emitente_nome,allowedBooks);
        const buyer=fromAiOwner(item.destinatario_nome,allowedBooks);
        const structuredOwner=seller&&!buyer?seller:buyer&&!seller?buyer:null;
        const byText=recognizedOwner(fullText,allowedBooks);
        const owner=structuredOwner||hinted||byText||defaultBook;
        // O titular usado no armazenamento é técnico, não uma escolha do usuário.
        // Se IA/OCR não encontrarem titular confiável, a conferência exige escolha.
        if(!structuredOwner&&!hinted&&!byText)notice.push("Titular não identificado automaticamente; selecione o titular na conferência antes de aprovar.");
        if(hinted&&byText&&String(hinted.id)!==String(byText.id)){
          notice.push("Há divergência na identificação do titular; confira antes de aprovar.");
        }
        const ownerId=Number(owner.id);
        const date=competence(item.competencia);
        if(date.estimated)notice.push("Competência estimada; confirme mês e ano.");
        const foundCategory=bestCategory(item.categoria,cats);
        const cat=foundCategory.existing;
        let categorySuggestion=foundCategory.suggested;
        if(!cat&&!categorySuggestion)notice.push("Categoria não identificada; confira a classificação.");
        if(categorySuggestion)notice.push("Nova categoria sugerida; ao aprovar, será cadastrada para os próximos lançamentos.");
        const xmlIncoming=method==="xml"&&buyer&&String(buyer.id)===String(owner.id)&&!seller;
        const xmlOutgoing=method==="xml"&&seller&&String(seller.id)===String(owner.id)&&!buyer;
        if(method==="xml"&&!xmlIncoming&&!xmlOutgoing)notice.push("Confira se a nota representa compra ou venda.");
        const title=short(item.titulo,170)||file.nome_original;
        const party=method==="xml"&&xmlOutgoing?
          short(item.destinatario_nome,150):short(item.contraparte,150);
        const value=amount(item.valor);
        if(!party)notice.push("Fornecedor ou contraparte não identificado.");
        if(value===null)notice.push("Valor principal não identificado.");
        const reference=short(item.referencia,100);
        const docType=short(item.documento_tipo,50).toLowerCase()||"outro";
        const type=xmlIncoming?"despesa":xmlOutgoing?"receita":item.tipo;
        if(method==="xml"&&xmlOutgoing)notice.push("Nota de saída identificada: confirme se deve entrar como receita.");
        let category=cat;
        if(!category&&method==="xml"){
          const products=normalizeName(item.descricao);
          const guess=/DIESEL|GASOLINA|COMBUSTIVEL/.test(products)?"Combustíveis > Diesel":
            /SEMENTE|SOJA SEMENTE|MILHO SEMENTE/.test(products)?"Insumos Agrícolas > Sementes":
            /FERTILIZANTE|ADUBO|UREIA|NPK/.test(products)?"Insumos Agrícolas > Fertilizantes":
            /HERBICIDA|FUNGICIDA|INSETICIDA|DEFENSIVO/.test(products)?"Insumos Agrícolas > Defensivos":
            xmlOutgoing?"Receitas":"";
          category=cats.find(c=>normalizeName(c.nome+(c.subcategoria?" > "+c.subcategoria:""))===normalizeName(guess));
          if(category) {
            categorySuggestion=null;
            const i=notice.indexOf("Categoria não identificada; confira a classificação.");
            if(i>=0)notice.splice(i,1);
          }
        }
        const start=Number(item.pagina_inicial),end=Number(item.pagina_final);
        const strongerReference=(
          (docType==="nota fiscal"&&/^\d{44}$/.test(reference))||
          (docType==="boleto"&&/^\d{44,48}$/.test(reference))||
          (docType==="comprovante"&&reference.length>=24)
        );
        // Nunca vincule automaticamente apenas porque fornecedor e mês coincidem.
        const related=await connection.query(
          "SELECT id::text FROM operacoes WHERE titular_id=$1 AND excluido_em IS NULL AND "+
          "((referencia<>'' AND referencia=$2 AND $2<>'') OR "+
          "($3::text<>'' AND valor=$4::numeric AND lower(contraparte)=lower($3) AND competencia=$5)) "+
          "ORDER BY CASE WHEN referencia=$2 AND $2<>'' THEN 0 ELSE 1 END,id DESC LIMIT 2",
          [ownerId,reference,party,value,date.date]
        );
        const chosen=related.rows.length===1?related.rows[0]?.id:null;
        if(chosen)notice.push("Possível operação relacionada encontrada: confira a vinculação sugerida.");
        const duplicates=strongerReference?await connection.query(
          "SELECT p.id::text FROM propostas p WHERE p.titular_id=$1 AND p.documento_tipo=$2 "+
          "AND p.referencia=$3 AND p.arquivo_id<>$4 ORDER BY p.id LIMIT 1",
          [ownerId,docType,reference,file.id]
        ):null;
        const extraWarnings=Array.isArray(item.avisos)?item.avisos.map(x=>short(x,160)).slice(0,7):[];
        const confidenceNumber=Number(item.confianca);
        const confidence=method==="xml"?0.95:
          Number.isFinite(confidenceNumber)&&item.confianca!==undefined?
            Math.max(0,Math.min(0.85,confidenceNumber)):0.3;
        const desc=short(item.descricao,2000)||title;
        await connection.query(
          "INSERT INTO propostas (arquivo_id,titular_id,titulo,documento_tipo,contraparte,competencia,"+
          "competencia_estimada,categoria_id,tipo,descricao,valor,referencia,pagina_inicial,pagina_final,"+
          "operacao_sugerida_id,duplicada_de,metodo_leitura,confianca,avisos,titular_sugerido,consulta_empresa,"+
          "categoria_sugerida_nome,categoria_sugerida_subcategoria) "+
          "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)",
          [file.id,ownerId,title,docType,party,date.date,date.estimated,category?.id||null,
            ["receita","despesa","outro"].includes(type)?type:"outro",
            desc,value,reference,
            Number.isInteger(start)&&start>=1?start:null,
            Number.isInteger(end)&&end>=start?end:null,
            chosen,duplicates?.rows[0]?.id||null,method,confidence,
            [...new Set([...notice,...extraWarnings])].slice(0,12),
            cleanSuggested,JSON.stringify(companyRecord),
            categorySuggestion?.nome||"",categorySuggestion?.subcategoria||""]
        );
      }
      // Reatribuímos o arquivo ao titular identificado apenas quando todas
      // as propostas do PDF têm um único titular reconhecido com confiança.
      // Caso contrário permanece técnico e será resolvido na aprovação.
      const ownerRows=await connection.query(
        "SELECT titular_id::text AS id,avisos FROM propostas WHERE arquivo_id=$1",
        [file.id]);
      const agreed=new Set(ownerRows.rows.map(x=>x.id));
      const uncertain=ownerRows.rows.some(x=>Array.isArray(x.avisos)&&x.avisos.some(
        warning=>String(warning).startsWith("Titular não identificado automaticamente")
      ));
      if(!uncertain&&agreed.size===1&&ownerRows.rows.length===items.length){
        await connection.query("UPDATE arquivos SET titular_envio_id=$2 WHERE id=$1",
          [file.id,ownerRows.rows[0].id]);
      }
      await connection.query(
        "UPDATE arquivos SET status='pronto',progresso_etapa='pronto',texto_extraido=$2,erro=NULL,atualizado_em=now() WHERE id=$1",
        [file.id,output.text.slice(0,1500000)]
      );
      await connection.query("COMMIT");
      console.log("Arquivo processado",file.id,"método",method,"documentos",items.length,
        "tempos_ms",JSON.stringify({ocr:timing.ocr_ms,cnpj:timing.cnpj_ms,ia:timing.ia_ms,total:Date.now()-timing.started}),
        "consulta_cnpj",companyRecord.status||"nao_consultado");
    }catch(error){
      await connection.query("ROLLBACK");
      throw error;
    }finally{connection.release();}
  }finally{await rm(folder,{recursive:true,force:true});}
}
async function claim(){
  const c=await db.connect();
  try{
    await c.query("BEGIN");
    const r=await c.query("SELECT * FROM arquivos WHERE status='aguardando' OR "+
      "(status='processando' AND atualizado_em < now() - interval '30 minutes') "+
      "ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1");
    if(!r.rows[0]){await c.query("COMMIT");return null;}
    await c.query("UPDATE arquivos SET status='processando',progresso_etapa='ocr',progresso_dados='{}'::jsonb,atualizado_em=now() WHERE id=$1",[r.rows[0].id]);
    await c.query("COMMIT");return r.rows[0];
  }catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}
}
console.log("Livro Caixa: trabalhador OCR iniciado");
for(;;) {
  try{
    const file=await claim();
    if(!file){await sleep(3000);continue;}
    try{await processFile(file);}
    catch(e){
      console.error("Falha OCR",file.id,e);
      await db.query("UPDATE arquivos SET status='erro',progresso_etapa='erro',erro=$2,atualizado_em=now() WHERE id=$1",[file.id,String(e).slice(0,600)]);
    }
  }catch(e){console.error("Worker indisponível",e);await sleep(8000);}
}
