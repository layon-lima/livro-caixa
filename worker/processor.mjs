import { Pool } from "pg";
import { parseLocalDocument } from "./local-parser.mjs";
import { XMLParser } from "fast-xml-parser";
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
  const folder=await mkdtemp(join(tmpdir(),"lc-"));
  try{
    if(file.armazenamento!=="local")throw Error("Arquivo anterior requer migração para a VPS");
    const bytes=gunzipSync(await readFile(compressedPath(file.chave_armazenamento)));
    const output=await extract(bytes,file.mime,folder);
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
    const defaultBook=allowedBooks.find(x=>String(x.id)===String(file.titular_envio_id));
    if(!defaultBook)throw Error("Titular do envio não está autorizado para o usuário.");
    // Processamento 100% local, sem requisições externas ou serviços de IA.
    const method=output.xml?"xml":"local";
    const items=output.xml||parseLocalDocument(output.text,file.nome_original,file.mime);
    if(!items.length)throw Error("Não foi possível identificar documentos no arquivo.");

    const connection=await db.connect();
    try{
      await connection.query("BEGIN");
      for(const item of items){
        const notice=[];
        const fullText=item.trecho||output.text;
        const hinted=fromAiOwner(item.titular_id||item.titular_nome,allowedBooks);
        const seller=fromAiOwner(item.emitente_nome,allowedBooks);
        const buyer=fromAiOwner(item.destinatario_nome,allowedBooks);
        const structuredOwner=seller&&!buyer?seller:buyer&&!seller?buyer:null;
        const byText=recognizedOwner(fullText,allowedBooks);
        const owner=structuredOwner||hinted||byText||defaultBook;
        if(!structuredOwner&&!hinted&&!byText)notice.push("Titular não confirmado pelo documento; mantido o titular escolhido no envio.");
        if(hinted&&byText&&String(hinted.id)!==String(byText.id)){
          notice.push("Há divergência na identificação do titular; confira antes de aprovar.");
        }
        const ownerId=Number(owner.id);
        const date=competence(item.competencia);
        if(date.estimated)notice.push("Competência estimada; confirme mês e ano.");
        const categoryName=normalizeName(item.categoria);
        const cat=cats.find(c=>normalizeName(c.nome+(c.subcategoria?" > "+c.subcategoria:""))===categoryName);
        if(!cat)notice.push("Categoria não determinada; selecione uma na conferência.");
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
            const i=notice.indexOf("Categoria não determinada; selecione uma na conferência.");
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
          "operacao_sugerida_id,duplicada_de,metodo_leitura,confianca,avisos) "+
          "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)",
          [file.id,ownerId,title,docType,party,date.date,date.estimated,category?.id||null,
            ["receita","despesa","outro"].includes(type)?type:"outro",
            desc,value,reference,
            Number.isInteger(start)&&start>=1?start:null,
            Number.isInteger(end)&&end>=start?end:null,
            chosen,duplicates?.rows[0]?.id||null,method,confidence,
            [...new Set([...notice,...extraWarnings])].slice(0,12)]
        );
      }
      await connection.query(
        "UPDATE arquivos SET status='pronto',texto_extraido=$2,erro=NULL,atualizado_em=now() WHERE id=$1",
        [file.id,output.text.slice(0,1500000)]
      );
      await connection.query("COMMIT");
      console.log("Arquivo processado",file.id,"método",method,"documentos",items.length);
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
    await c.query("UPDATE arquivos SET status='processando',atualizado_em=now() WHERE id=$1",[r.rows[0].id]);
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
      await db.query("UPDATE arquivos SET status='erro',erro=$2,atualizado_em=now() WHERE id=$1",[file.id,String(e).slice(0,600)]);
    }
  }catch(e){console.error("Worker indisponível",e);await sleep(8000);}
}
