/** Accept only a valid real payment date from an edited/approved form. */
export function parsePaymentDate(input:FormDataEntryValue|null):string|null|undefined{
  const value=String(input||"").trim();
  if(!value)return null;
  if(!/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value))return undefined;
  const [y,m,d]=value.split("-").map(Number);
  const check=new Date(Date.UTC(y,m-1,d));
  return check.getUTCFullYear()===y&&check.getUTCMonth()===m-1&&
    check.getUTCDate()===d?value:undefined;
}