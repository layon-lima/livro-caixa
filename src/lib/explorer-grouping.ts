// Agrupamento visual, sem criar, fundir ou excluir operações.
export type GroupSource={
  mes:string;categoria_id:string|null;categoria:string|null;
  subcategoria:string|null;contraparte:string|null;quantidade:number;
};
export type RecipientGroup={
  key:string;name:string;variants:string[];count:number;
};
export type CategoryGroup={
  key:string;name:string;subcategoria:string|null;ids:string[];count:number;
  recipients:RecipientGroup[];
};
export type MonthGroup={mes:string;count:number;categories:CategoryGroup[]};

export function groupText(input:string|null|undefined):string{
  return String(input||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toUpperCase().replace(/[^A-Z0-9]+/g," ").trim().replace(/\s+/g," ");
}
export function recipientKey(name:string|null|undefined){
  return groupText(name)||"__SEM_RECEBEDOR__";
}
export function categoryKey(name:string|null|undefined,sub:string|null|undefined){
  if(!name)return "__SEM_CATEGORIA__";
  return groupText(name)+" / "+groupText(sub);
}
export function categoryName(name:string|null|undefined,sub:string|null|undefined){
  return name?[name,sub].filter(Boolean).join(" / "):"Sem categoria";
}
export function monthTitle(mes:string){
  const match=mes.match(/^(20\d{2})-(0[1-9]|1[0-2])$/);
  if(!match)return mes;
  return new Intl.DateTimeFormat("pt-BR",{month:"long",year:"numeric"})
    .format(new Date(Number(match[1]),Number(match[2])-1,1));
}
export function explorerHref(bookId:number|string,options:{
  mes?:string;categoria?:string;recebedor?:string
}={}):string{
  const params=new URLSearchParams();
  if(options.mes)params.set("mes",options.mes);
  if(options.categoria)params.set("categoria",options.categoria);
  if(options.recebedor)params.set("recebedor",options.recebedor);
  const query=params.toString();
  return "/livros/"+bookId+(query?"?"+query:"");
}

export function buildExplorerGroups(rows:GroupSource[]):MonthGroup[]{
  const months=new Map<string,{mes:string;count:number;cats:Map<string,{
    key:string;name:string;subcategoria:string|null;ids:Set<string>;count:number;
    receivers:Map<string,RecipientGroup>
  }> }>();
  for(const row of rows){
    if(!/^\d{4}-\d\d$/.test(row.mes))continue;
    const count=Number(row.quantidade)||0;
    let month=months.get(row.mes);
    if(!month){
      month={mes:row.mes,count:0,cats:new Map()};
      months.set(row.mes,month);
    }
    month.count+=count;
    const key=categoryKey(row.categoria,row.subcategoria);
    let cat=month.cats.get(key);
    if(!cat){
      cat={key,name:row.categoria||"Sem categoria",
        subcategoria:row.subcategoria,ids:new Set(),count:0,receivers:new Map()};
      month.cats.set(key,cat);
    }
    if(row.categoria_id)cat.ids.add(row.categoria_id);
    cat.count+=count;
    const rkey=recipientKey(row.contraparte);
    let recipient=cat.receivers.get(rkey);
    if(!recipient){
      recipient={key:rkey,name:row.contraparte?.trim()||"Sem recebedor",
        variants:[],count:0};
      cat.receivers.set(rkey,recipient);
    }
    const raw=row.contraparte||"";
    if(!recipient.variants.includes(raw))recipient.variants.push(raw);
    recipient.count+=count;
  }
  return [...months.values()].sort((a,b)=>b.mes.localeCompare(a.mes)).map(m=>({
    mes:m.mes,count:m.count,
    categories:[...m.cats.values()].sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"))
      .map(c=>({
        key:c.key,name:c.name,subcategoria:c.subcategoria,ids:[...c.ids],count:c.count,
        recipients:[...c.receivers.values()].sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"))
      }))
  }));
}
