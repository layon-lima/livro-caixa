// Só associamos EndToEndId quando há exatamente um identificador Pix.
export function extractPixEndToEndId(text){
  const found=new Set();
  for(const match of String(text||"").matchAll(/\bE\d{8}[A-Z0-9]{18,32}\b/gi)){
    found.add(match[0].toUpperCase());
    if(found.size>1)return "";
  }
  return [...found][0]||"";
}
