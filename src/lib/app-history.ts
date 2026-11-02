// Histórico independente da aba do navegador: sempre começa na página inicial.
// Dessa forma, a seta do app nunca volta para um site externo ou para o login.
export type AppHistory={entries:string[];index:number};
export const ROOT_HISTORY:AppHistory={entries:["/"],index:0};

export function isInternalPath(value:unknown):value is string {
  return typeof value==="string"&&value.startsWith("/")&&!value.startsWith("//")&&
    !value.includes("\\")&&!/[\u0000-\u001f\u007f]/.test(value)&&value.length<=2048;
}

export function safeHistory(value:unknown):AppHistory {
  if(!value||typeof value!=="object")return ROOT_HISTORY;
  const raw=value as {entries?:unknown;index?:unknown};
  const entries=Array.isArray(raw.entries)?
    raw.entries.filter(isInternalPath).slice(-100):[];
  if(entries[0]!=="/")entries.unshift("/");
  const index=typeof raw.index==="number"&&Number.isInteger(raw.index)?
    Math.max(0,Math.min(raw.index,entries.length-1)):entries.length-1;
  return {entries,index};
}

// Visitas normais acrescentam uma página; navegação ao início encerra o
// caminho de volta. As setas conservam a parte à frente da posição atual.
export function visitPage(history:AppHistory,url:string,popstate=false):AppHistory {
  const h=safeHistory(history);
  if(!isInternalPath(url))return h;
  if(h.entries[h.index]===url)return h;

  if(popstate){
    if(h.entries[h.index-1]===url)return {...h,index:h.index-1};
    if(h.entries[h.index+1]===url)return {...h,index:h.index+1};
    if(url==="/")return {...h,index:0};
    const existing=h.entries.lastIndexOf(url);
    if(existing>=0)return {...h,index:existing};
  }

  // Visitar explicitamente a página inicial redefine o limite de retorno.
  if(url==="/")return ROOT_HISTORY;
  const entries=[...h.entries.slice(0,h.index+1),url].slice(-100);
  if(entries[0]!=="/")entries.unshift("/");
  return {entries,index:entries.length-1};
}

export function movePage(history:AppHistory,delta:-1|1):AppHistory|null {
  const h=safeHistory(history);
  const next=h.index+delta;
  if(next<0||next>=h.entries.length)return null;
  // Mesmo com um estado antigo, não voltamos para antes da home.
  return {...h,index:next};
}
