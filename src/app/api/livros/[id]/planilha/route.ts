import { NextResponse } from "next/server";
import { currentUser, canAccessTitular } from "@/lib/auth";
import { parseExpenseFilters,expensePage } from "@/lib/expense-report";
import { safeId } from "@/lib/document-data";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await currentUser();
  if(!user)return NextResponse.json({error:"Não autenticado"},{status:401});
  const id=safeId((await params).id);
  if(!id||!await canAccessTitular(user,id,"view"))
    return NextResponse.json({error:"Acesso negado"},{status:403});
  try{
    const filters=parseExpenseFilters(new URL(request.url).searchParams);
    const data=await expensePage(id,filters);
    return NextResponse.json(data,{headers:{"Cache-Control":"private, no-store"}});
  }catch(e){
    console.error("Falha na consulta da planilha",id,e);
    return NextResponse.json({error:"Não foi possível consultar os lançamentos."},{status:500});
  }
}